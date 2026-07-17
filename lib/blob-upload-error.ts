export function blobUploadErrorMessage(error: unknown, fallback: string) {
  if (!(error instanceof Error)) return fallback;

  if (/failed to\s+retrieve (?:the )?(?:client token|presigned url)/i.test(error.message)) {
    return 'Image storage could not be reached. Please refresh and try again.';
  }

  return error.message;
}
