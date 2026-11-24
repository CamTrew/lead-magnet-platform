/** Bound untrusted assistant payloads before allocating the complete body. */
export async function readAssistantBody(request: Request, limit: number) {
  if (Number(request.headers.get("content-length")) > limit)
    throw new Error("Request too large.");
  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new Error("Request too large.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks).toString("utf8");
}
