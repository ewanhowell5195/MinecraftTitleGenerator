import fs from "node:fs"
import { PNG } from "pngjs"
import { pngOf } from "./png.js"
import { REPO, editForm, sendForm, serverEnv } from "./server.js"

export const TEXTURES = "public/fonts/minecraft-ten/textures.json"
export const LEGENDS = "public/fonts/minecraft-legends/textures.json"
export const WIKI = "public/fonts/minecraft-wiki/textures.json"
export const FLAT = PNG.sync.read(fs.readFileSync("public/fonts/minecraft-ten/textures/flat.png"))

export let gh
export let waiting
export let db
export let emails
export let resend
export let restore

export function textureServer() {
  ({ gh, waiting, db, emails, resend, restore } = serverEnv({ files: [TEXTURES, LEGENDS, WIKI] }))
}

export function form(fields = {}, image = pngOf(FLAT.width, FLAT.height)) {
  const data = new FormData()
  const { font = "minecraft-ten", border = "#3D1F0A", ...rest } = fields
  const values = { kind: "texture", target: font, name: "Gold Bricks", credit: ["Someone"], notes: "", agree: "true", details: JSON.stringify({ border }), ...rest }
  values.credit = JSON.stringify(values.credit)
  for (const [key, value] of Object.entries(values)) data.set(key, value)
  if (image) data.set("file", new Blob([image], { type: "image/png" }), "texture.png")
  return data
}

export const send = (cookie, fields, image) => sendForm(cookie, form(fields, image))
export const edit = (cookie, id, fields, image = null) => editForm(cookie, id, form(fields, image))

export function holdGitHub(matches) {
  const handle = gh.handle
  let held = false
  let reached
  let release
  const arrived = new Promise(resolve => (reached = resolve))
  const opened = new Promise(resolve => (release = resolve))
  gh.handle = async (url, options = {}) => {
    if (!held && matches(options.method ?? "GET", url)) {
      held = true
      reached()
      await opened
    }
    return handle(url, options)
  }
  return { arrived, release }
}

export function closed(number, merged, id) {
  return { action: "closed", sender: { login: "ewan" }, pull_request: { number, merged, html_url: `https://github.com/${REPO}/pull/${number}`, head: { ref: `submission/${id}` } } }
}
