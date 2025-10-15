// Tiny wrapper to enable mocking in tests
export async function uploadBufferReturnPublicUrl(_buffer: Uint8Array | Buffer, keyHint: string): Promise<string> {
  // In production, wire to Blob storage. Tests will mock this.
  return `https://blob.local/${encodeURIComponent(keyHint)}`
}
