import fs from "node:fs"

const PNG_SIGNATURE = "89504e470d0a1a0a"

export function pngSize(file) {
  const header = Buffer.alloc(24)
  const handle = fs.openSync(file, "r")
  try {
    fs.readSync(handle, header, 0, 24, 0)
  } finally {
    fs.closeSync(handle)
  }
  if (header.subarray(0, 8).toString("hex") !== PNG_SIGNATURE) throw new Error(`${file} is not a PNG`)
  return { width: header.readUInt32BE(16), height: header.readUInt32BE(20) }
}
