import { createHash } from 'node:crypto';
import { put, del } from '@vercel/blob';
import { createHostedResource, resolveCampaignHostedResource, withAssistantResourceUploadLock } from './platform-store';
import { hostedResourceContentType, hostedResourceExtension, hostedResourcePathname, isHostedResourceBlobUrl, validateHostedResourceFile } from './hosted-resources';

export const ASSISTANT_FILE_MAX_BYTES = 1024 * 1024;

export function decodeAssistantFile(filename: string, fileBase64: string) {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(fileBase64) || fileBase64.length > 1400000 || fileBase64.length % 4 !== 0) throw new Error('Supply the original file as base64 bytes.');
  const bytes = Buffer.from(fileBase64, 'base64');
  if (bytes.toString('base64') !== fileBase64) throw new Error('The file encoding is incomplete. Upload the original file again.');
  if (bytes.length > ASSISTANT_FILE_MAX_BYTES) throw new Error('Files over 1 MB need the Hosted resources upload screen.');
  const contentType = hostedResourceContentType(filename);
  const error = validateHostedResourceFile({ name: filename, size: bytes.length, type: contentType });
  if (error) throw new Error(error);
  const extension = hostedResourceExtension(filename);
  const starts = (hex: string) => bytes.subarray(0, hex.length / 2).toString('hex') === hex;
  const zip = starts('504b0304') || starts('504b0506') || starts('504b0708');
  const valid = extension === '.pdf' ? bytes.subarray(0, 5).toString() === '%PDF-'
    : ['.zip', '.docx', '.xlsx', '.pptx'].includes(extension) ? zip
    : ['.doc', '.xls', '.ppt'].includes(extension) ? starts('d0cf11e0a1b11ae1')
    : extension === '.png' ? starts('89504e470d0a1a0a')
    : ['.jpg', '.jpeg'].includes(extension) ? starts('ffd8ff')
    : extension === '.gif' ? ['GIF87a', 'GIF89a'].includes(bytes.subarray(0, 6).toString())
    : extension === '.webp' ? bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP'
    : !bytes.includes(0) && !bytes.toString('utf8').includes('\ufffd');
  if (!valid) throw new Error('The file bytes do not match the filename. Use the original supported file.');
  return { bytes, contentType };
}

export async function uploadAssistantResource(accountId: string, filename: string, fileBase64: string, storage = { put, del }) {
  const { bytes, contentType } = decodeAssistantFile(filename, fileBase64);
  // Content-addressed within this account: retries reuse one file; new bytes never overwrite it.
  const digest = createHash('sha256').update(accountId).update('\0').update(filename).update('\0').update(bytes).digest('hex');
  const id = `${digest.slice(0,8)}-${digest.slice(8,12)}-4${digest.slice(13,16)}-a${digest.slice(17,20)}-${digest.slice(20,32)}`;
  return withAssistantResourceUploadLock(accountId, id, async runner => {
    const existing = await resolveCampaignHostedResource(accountId, id, runner).catch(error => {
      if (error instanceof Error && error.message.startsWith('File not found')) return null;
      throw error;
    });
    if (existing) return existing;
    const storeId = process.env.HOSTED_RESOURCES_BLOB_STORE_ID?.trim();
    const token = process.env.HOSTED_RESOURCES_READ_WRITE_TOKEN?.trim();
    if (!storeId || storeId === process.env.BLOB_STORE_ID || (!token && !process.env.VERCEL_OIDC_TOKEN)) throw new Error('Private file storage is not available. Use Hosted resources to check upload availability.');
    const options = { storeId, token };
    const blob = await storage.put(hostedResourcePathname(accountId, id, filename), bytes, { ...options, access: 'private', contentType, addRandomSuffix: true });
    if (!isHostedResourceBlobUrl(blob.url, accountId, id)) throw new Error('The file was not stored in the expected private location.');
    try {
      return await createHostedResource({ id, accountId, name: filename, originalFilename: filename, contentType, sizeBytes: bytes.length, blobUrl: blob.url }, runner);
    } catch (error) {
      // A quota or metadata failure must not leave an untracked uploaded file.
      await storage.del(blob.url, options).catch(() => undefined);
      throw error;
    }
  });
}
