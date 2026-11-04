import { execFile } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { promisify } from "node:util"
import optipng from "optipng-bin"
import { pixelHash, readJson, readPng, writeJson } from "./common.js"

const run = promisify(execFile)
const root = path.join(import.meta.dirname, "../public")
const recordFile = path.join(import.meta.dirname, "compressed.json")

const saved = fs.existsSync(recordFile) ? readJson(recordFile) : {}
const files = fs.readdirSync(root, { recursive: true }).map(file => file.replaceAll("\\", "/")).filter(file => file.endsWith(".png"))
const record = {}
const pending = []

function saveRecord() {
  writeJson(recordFile, Object.fromEntries(Object.entries(record).sort(([a], [b]) => a < b ? -1 : 1)))
}

for (const file of files) {
  const hash = pixelHash(readPng(path.join(root, file)))
  if (saved[file] === hash) record[file] = hash
  else pending.push({ file, hash })
}

saveRecord()
console.log(`${files.length} images, ${pending.length} to compress`)

const failures = []
let next = 0
let done = 0

async function worker() {
  while (next < pending.length) {
    const { file, hash } = pending[next++]
    const full = path.join(root, file)
    try {
      await run(optipng, ["-o7", "-strip", "all", "-quiet", "--", full])
      if (pixelHash(readPng(full)) !== hash) throw new Error("compressing changed its pixels")
      record[file] = hash
      saveRecord()
    } catch (err) {
      failures.push(`${file}: ${err.message}`)
    }
    done++
    if (done % 50 === 0 || done === pending.length) console.log(`${done} of ${pending.length}`)
  }
}

await Promise.all(Array.from({ length: os.availableParallelism() }, worker))

if (failures.length) throw new Error(`${failures.length} images failed to compress\n${failures.join("\n")}`)
