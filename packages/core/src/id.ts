// Web Crypto is available in browsers, Node, Tauri webviews and React Native (with a polyfill).
declare const crypto: { getRandomValues<T extends Uint8Array>(array: T): T };

/**
 * Creates a UUID v7 (RFC 9562): a 48-bit millisecond timestamp followed by random bits.
 * IDs sort by creation time, which keeps database indexes compact.
 */
export function newId(now: number = Date.now()): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));

  let timestamp = now;
  for (let i = 5; i >= 0; i--) {
    bytes[i] = timestamp % 256;
    timestamp = Math.floor(timestamp / 256);
  }
  bytes[6] = (bytes[6]! & 0x0f) | 0x70; // version 7
  bytes[8] = (bytes[8]! & 0x3f) | 0x80; // RFC 9562 variant

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
