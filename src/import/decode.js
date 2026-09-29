// Text from the bytes of a chosen file. Broker and terminal exports come in UTF-8 (with or without a
// BOM), UTF-16 (MetaTrader reports saved on Windows) and Windows-1252 (older Excel-style CSV).
// Pure over an ArrayBuffer; TextDecoder is in browsers and Node.

export function decodeBytes(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return { text: new TextDecoder('utf-16le').decode(bytes.subarray(2)), encoding: 'utf-16le' };
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) return { text: new TextDecoder('utf-16be').decode(bytes.subarray(2)), encoding: 'utf-16be' };
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return { text: new TextDecoder('utf-8').decode(bytes.subarray(3)), encoding: 'utf-8' };
  // UTF-16 without a BOM: every second byte is zero in Latin text
  if (bytes.length >= 4) {
    let zerosOdd = 0;
    let zerosEven = 0;
    const n = Math.min(bytes.length, 400);
    for (let i = 0; i < n; i++) { if (bytes[i] === 0) { if (i % 2) zerosOdd++; else zerosEven++; } }
    if (zerosOdd > n / 4 && zerosEven === 0) return { text: new TextDecoder('utf-16le').decode(bytes), encoding: 'utf-16le' };
    if (zerosEven > n / 4 && zerosOdd === 0) return { text: new TextDecoder('utf-16be').decode(bytes), encoding: 'utf-16be' };
  }
  try { return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), encoding: 'utf-8' }; } catch { /* not UTF-8 */ }
  return { text: new TextDecoder('windows-1252').decode(bytes), encoding: 'windows-1252' };
}

export async function readFileText(file) {
  return decodeBytes(await file.arrayBuffer());
}
