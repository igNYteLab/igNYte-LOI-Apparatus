type ZipEntryInput = {
  path: string
  data: Blob | ArrayBuffer | Uint8Array | string
  lastModified?: Date
}

type PreparedZipEntry = {
  pathBytes: Uint8Array
  data: Uint8Array
  crc32: number
  compressedSize: number
  uncompressedSize: number
  modTime: number
  modDate: number
  localHeaderOffset: number
}

const textEncoder = new TextEncoder()
const crcTable = makeCrcTable()

export async function createZipBlob(entries: ZipEntryInput[]): Promise<Blob> {
  const prepared: PreparedZipEntry[] = []
  let offset = 0

  for (const entry of entries) {
    const data = await toBytes(entry.data)
    const pathBytes = textEncoder.encode(normalizeZipPath(entry.path))
    const modified = entry.lastModified ?? new Date()
    const dos = toDosDateTime(modified)
    const preparedEntry: PreparedZipEntry = {
      pathBytes,
      data,
      crc32: crc32(data),
      compressedSize: data.byteLength,
      uncompressedSize: data.byteLength,
      modTime: dos.time,
      modDate: dos.date,
      localHeaderOffset: offset,
    }
    prepared.push(preparedEntry)
    offset += 30 + pathBytes.byteLength + data.byteLength
  }

  const centralDirectoryOffset = offset
  for (const entry of prepared) {
    offset += 46 + entry.pathBytes.byteLength
  }
  const centralDirectorySize = offset - centralDirectoryOffset
  offset += 22

  const zip = new Uint8Array(offset)
  let cursor = 0
  for (const entry of prepared) {
    cursor = writeLocalHeader(zip, cursor, entry)
    zip.set(entry.data, cursor)
    cursor += entry.data.byteLength
  }
  for (const entry of prepared) {
    cursor = writeCentralDirectoryHeader(zip, cursor, entry)
  }
  writeEndOfCentralDirectory(
    zip,
    cursor,
    prepared.length,
    centralDirectorySize,
    centralDirectoryOffset
  )

  return new Blob([zip], { type: "application/zip" })
}

async function toBytes(data: ZipEntryInput["data"]): Promise<Uint8Array> {
  if (typeof data === "string") return textEncoder.encode(data)
  if (data instanceof Uint8Array) return data
  if (data instanceof ArrayBuffer) return new Uint8Array(data)
  return new Uint8Array(await data.arrayBuffer())
}

function normalizeZipPath(path: string) {
  return path.replace(/\\/g, "/").replace(/^\/+/, "")
}

function writeLocalHeader(
  target: Uint8Array,
  offset: number,
  entry: PreparedZipEntry
) {
  const view = new DataView(target.buffer)
  view.setUint32(offset, 0x04034b50, true)
  view.setUint16(offset + 4, 20, true)
  view.setUint16(offset + 6, 0x0800, true)
  view.setUint16(offset + 8, 0, true)
  view.setUint16(offset + 10, entry.modTime, true)
  view.setUint16(offset + 12, entry.modDate, true)
  view.setUint32(offset + 14, entry.crc32, true)
  view.setUint32(offset + 18, entry.compressedSize, true)
  view.setUint32(offset + 22, entry.uncompressedSize, true)
  view.setUint16(offset + 26, entry.pathBytes.byteLength, true)
  view.setUint16(offset + 28, 0, true)
  target.set(entry.pathBytes, offset + 30)
  return offset + 30 + entry.pathBytes.byteLength
}

function writeCentralDirectoryHeader(
  target: Uint8Array,
  offset: number,
  entry: PreparedZipEntry
) {
  const view = new DataView(target.buffer)
  view.setUint32(offset, 0x02014b50, true)
  view.setUint16(offset + 4, 20, true)
  view.setUint16(offset + 6, 20, true)
  view.setUint16(offset + 8, 0x0800, true)
  view.setUint16(offset + 10, 0, true)
  view.setUint16(offset + 12, entry.modTime, true)
  view.setUint16(offset + 14, entry.modDate, true)
  view.setUint32(offset + 16, entry.crc32, true)
  view.setUint32(offset + 20, entry.compressedSize, true)
  view.setUint32(offset + 24, entry.uncompressedSize, true)
  view.setUint16(offset + 28, entry.pathBytes.byteLength, true)
  view.setUint16(offset + 30, 0, true)
  view.setUint16(offset + 32, 0, true)
  view.setUint16(offset + 34, 0, true)
  view.setUint16(offset + 36, 0, true)
  view.setUint32(offset + 38, 0, true)
  view.setUint32(offset + 42, entry.localHeaderOffset, true)
  target.set(entry.pathBytes, offset + 46)
  return offset + 46 + entry.pathBytes.byteLength
}

function writeEndOfCentralDirectory(
  target: Uint8Array,
  offset: number,
  entryCount: number,
  centralDirectorySize: number,
  centralDirectoryOffset: number
) {
  const view = new DataView(target.buffer)
  view.setUint32(offset, 0x06054b50, true)
  view.setUint16(offset + 4, 0, true)
  view.setUint16(offset + 6, 0, true)
  view.setUint16(offset + 8, entryCount, true)
  view.setUint16(offset + 10, entryCount, true)
  view.setUint32(offset + 12, centralDirectorySize, true)
  view.setUint32(offset + 16, centralDirectoryOffset, true)
  view.setUint16(offset + 20, 0, true)
}

function toDosDateTime(date: Date) {
  const year = Math.max(1980, date.getFullYear())
  return {
    time:
      (date.getHours() << 11) |
      (date.getMinutes() << 5) |
      Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  }
}

function makeCrcTable() {
  const table = new Uint32Array(256)
  for (let i = 0; i < table.length; i += 1) {
    let c = i
    for (let j = 0; j < 8; j += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[i] = c >>> 0
  }
  return table
}

function crc32(data: Uint8Array) {
  let crc = 0xffffffff
  for (const byte of data) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}
