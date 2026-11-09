import { execFileSync } from "node:child_process"
import path from "node:path"
import * as font from "./submissionKinds/font.js"
import * as fontAsset from "./submissionKinds/fontAsset.js"
import * as strip from "./submissionKinds/strip.js"
import * as tileable from "./submissionKinds/tileable.js"

const ROOT = path.join(import.meta.dirname, "..")
const STEPS = [font, fontAsset, strip, tileable]

function git(...args) {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).split("\n").filter(Boolean)
}

const ran = new Set()

function node(...args) {
  const key = args.join("\n")
  if (ran.has(key)) return
  ran.add(key)
  execFileSync(process.execPath, args, { cwd: ROOT, stdio: "inherit" })
}

const [base] = git("merge-base", "origin/main", "HEAD")
const changed = git("diff", "--name-only", base, "HEAD")
for (const step of STEPS) await step.prepare({ root: ROOT, base, changed, git, node })

const images = new Set(git("diff", "--name-only", base, "HEAD").concat(git("ls-files", "--others", "--modified", "--exclude-standard")).filter(file => file.startsWith("public/") && file.endsWith(".png")))
if (images.size) node("generator/compress.js", ...images)
