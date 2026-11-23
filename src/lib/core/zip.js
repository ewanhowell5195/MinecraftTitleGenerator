import { zipSync } from "three/addons/libs/fflate.module.js"

export async function zipOf(files) {
  const entries = await Promise.all(files.map(async ({ name, blob }) => [name, new Uint8Array(await blob.arrayBuffer())]))
  return new Blob([zipSync(Object.fromEntries(entries), { level: 0 })], { type: "application/zip" })
}
