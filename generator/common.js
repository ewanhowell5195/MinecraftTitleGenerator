import { createHash } from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { PNG } from "pngjs"
import { jsonText } from "../src/lib/jsonText.js"

export function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"))
}

export function writeJson(file, data) {
  fs.writeFileSync(file, `${jsonText(data)}\n`)
}

export function readPng(file) {
  return PNG.sync.read(fs.readFileSync(file))
}

export function writePng(file, png) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, PNG.sync.write(png))
}

export function pixelHash(png) {
  return createHash("sha256").update(png.data).digest("hex")
}

export function pngOf({ width, height, data }) {
  const png = new PNG({ width, height })
  png.data.set(data)
  return png
}

export function cli(usage, { optional = false } = {}) {
  const [first, ...flags] = process.argv.slice(2)
  if (!first && !optional) throw new Error(`usage: node generator/${usage}`)
  return { first, has: name => flags.includes(name), option: name => flags.includes(name) ? flags[flags.indexOf(name) + 1] : undefined }
}

export async function inParallel(items, run) {
  let next = 0
  async function worker() {
    while (next < items.length) {
      const index = next++
      await run(items[index], index)
    }
  }
  await Promise.all(Array.from({ length: os.availableParallelism() }, worker))
}

export function rgba(data, i) {
  return [data[i], data[i + 1], data[i + 2], data[i + 3]]
}
