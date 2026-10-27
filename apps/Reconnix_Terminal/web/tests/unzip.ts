/* Read a stored ZIP (what lib/report/docx/zip.ts writes) back for the tests: the central
   directory, each local header, and each entry's CRC checked with the writer's own crc32 (which
   docx.test.ts checks against known values, so a wrong table can't pass both ways). */
import { crc32 } from "../src/lib/report/docx/zip";

/** Every entry's text, by name; throws when the archive or a CRC is wrong. */
export function unzip(bytes: Uint8Array): Map<string, string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = bytes.length - 22;
  if (view.getUint32(end, true) !== 0x06054b50) throw new Error("no end of central directory");
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const dec = new TextDecoder("utf-8", { fatal: true });
  const out = new Map<string, string>();
  for (let i = 0; i < count; i++) {
    if (view.getUint32(at, true) !== 0x02014b50) throw new Error("bad central header");
    const method = view.getUint16(at + 10, true);
    const crc = view.getUint32(at + 16, true);
    const size = view.getUint32(at + 20, true);
    const nameLen = view.getUint16(at + 28, true);
    const local = view.getUint32(at + 42, true);
    const name = dec.decode(bytes.subarray(at + 46, at + 46 + nameLen));
    if (method !== 0) throw new Error(`${name}: not stored`);
    if (view.getUint32(local, true) !== 0x04034b50) throw new Error(`${name}: bad local header`);
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const data = bytes.subarray(start, start + size);
    if (crc32(data) !== crc) throw new Error(`${name}: CRC mismatch`);
    out.set(name, dec.decode(data));
    at += 46 + nameLen + view.getUint16(at + 30, true) + view.getUint16(at + 32, true);
  }
  return out;
}
