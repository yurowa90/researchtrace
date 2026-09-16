// ZIP store format with streaming data descriptors; no full archive buffering.
export type ZipEntry = { name: string; size: number; open: () => Promise<ReadableStream<Uint8Array>> };
const encoder = new TextEncoder();
const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  let crc = value; for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1; return crc >>> 0;
});
function block(length: number) { const bytes = new Uint8Array(length); return { bytes, view: new DataView(bytes.buffer) }; }
export function zipText(name: string, text: string): ZipEntry {
  const bytes = encoder.encode(text);
  return { name, size: bytes.length, open: async () => new ReadableStream({ start(controller) { controller.enqueue(bytes); controller.close(); } }) };
}
export function streamZip(entries: ZipEntry[]): ReadableStream<Uint8Array> {
  async function* generate() {
    let offset = 0;
    const directory: Array<{ name: Uint8Array; offset: number; crc: number; size: number }> = [];
    for (const entry of entries) {
      if (!entry.name || entry.name.includes("..") || /[\\/\x00]/.test(entry.name) || !Number.isSafeInteger(entry.size) || entry.size < 0 || entry.size > 0xffffffff) throw new Error("Invalid ZIP entry");
      const name = encoder.encode(entry.name);
      if (name.length > 65535) throw new Error("ZIP name too long");
      const header = block(30 + name.length);
      header.view.setUint32(0, 0x04034b50, true); header.view.setUint16(4, 20, true);
      header.view.setUint16(6, 0x0808, true); header.view.setUint16(12, 33, true); header.view.setUint16(26, name.length, true); header.bytes.set(name, 30);
      const start = offset; offset += header.bytes.length; yield header.bytes;
      const reader = (await entry.open()).getReader(); let crc = 0xffffffff, size = 0;
      try {
        while (true) {
          const { done, value } = await reader.read(); if (done) break;
          size += value.length; if (size > entry.size) throw new Error("ZIP entry size changed");
          for (const byte of value) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
          offset += value.length; yield value;
        }
      } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
      if (size !== entry.size) throw new Error("ZIP entry truncated");
      crc = (crc ^ 0xffffffff) >>> 0;
      const descriptor = block(16); descriptor.view.setUint32(0, 0x08074b50, true); descriptor.view.setUint32(4, crc, true); descriptor.view.setUint32(8, size, true); descriptor.view.setUint32(12, size, true);
      offset += 16; yield descriptor.bytes; directory.push({ name, offset: start, crc, size });
    }
    const directoryStart = offset;
    for (const entry of directory) {
      const header = block(46 + entry.name.length);
      header.view.setUint32(0, 0x02014b50, true); header.view.setUint16(4, 20, true); header.view.setUint16(6, 20, true); header.view.setUint16(8, 0x0808, true); header.view.setUint16(14, 33, true);
      header.view.setUint32(16, entry.crc, true); header.view.setUint32(20, entry.size, true); header.view.setUint32(24, entry.size, true); header.view.setUint16(28, entry.name.length, true); header.view.setUint32(42, entry.offset, true); header.bytes.set(entry.name, 46);
      offset += header.bytes.length; yield header.bytes;
    }
    const end = block(22); end.view.setUint32(0, 0x06054b50, true); end.view.setUint16(8, directory.length, true); end.view.setUint16(10, directory.length, true); end.view.setUint32(12, offset - directoryStart, true); end.view.setUint32(16, directoryStart, true); yield end.bytes;
  }
  const iterator = generate();
  return new ReadableStream({
    async pull(controller) { try { const result = await iterator.next(); if (result.done) controller.close(); else controller.enqueue(result.value); } catch (error) { controller.error(error); } },
    async cancel() { await iterator.return(undefined); },
  });
}
