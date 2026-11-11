import { execFileSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { ROOT } from "./fonts.js"
import * as font from "./submissionKinds/font.js"
import * as fontAsset from "./submissionKinds/fontAsset.js"
import * as shape from "./submissionKinds/shape.js"
import * as strip from "./submissionKinds/strip.js"
import * as tileable from "./submissionKinds/tileable.js"

const STEPS = [font, fontAsset, strip, tileable, shape]

export function imagesToCompress(root, files) {
  return Array.from(new Set(files.filter(file => file.startsWith("public/") && file.endsWith(".png") && fs.existsSync(path.join(root, file)))))
}

function git(...args) {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).split("\n").filter(Boolean)
}

async function run() {
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
  const images = imagesToCompress(ROOT, git("diff", "--name-only", base, "HEAD").concat(git("ls-files", "--others", "--modified", "--exclude-standard")))
  if (images.length) node("generator/compress.js", ...images)
}

if (import.meta.main) await run()
