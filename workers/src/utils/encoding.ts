// ============================================================================
// Shared encoding utils
// Single home for base64 conversion so the router, OpenAI endpoint, and
// image generation modules cannot drift apart. Pure functions, no bindings.
// ============================================================================

/**
 * Convert ArrayBuffer to base64 string (chunked to avoid call-stack limits)
 */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000; // 32KB
  let binary = "";

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...(chunk as unknown as number[]));
  }

  return btoa(binary);
}

/**
 * Strip a data-URI prefix (e.g. "data:image/png;base64,"); plain base64
 * passes through unchanged.
 */
export function cleanBase64(data: string): string {
  return data.replace(/^data:image\/\w+;base64,/, "");
}

/**
 * Convert base64 string (with or without data-URI prefix) to Uint8Array
 */
export function base64ToUint8Array(base64: string): Uint8Array {
  const data = cleanBase64(base64);
  const binaryString = atob(data);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}
