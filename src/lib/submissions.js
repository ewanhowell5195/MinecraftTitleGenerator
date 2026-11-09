import { blockedWordProblem } from "./wording.js"

export const SUBMISSION_LIMITS = { name: 40, credit: 60, notes: 500, fileBytes: 1900000, totalBytes: 12000000, extraFiles: 24, side: 4096, perDay: 10, listed: 100, notifications: 50, comment: 2000, comments: 200 }

export const EXTRA_FILE = /^[a-z0-9-]{1,40}$/

export const EDITOR_SUBMISSION = "minecraft-title-editor-submission"

export const SUBMISSION_STATUSES = {
  open: "Waiting for review",
  published: "Published",
  rejected: "Not accepted"
}

export const HEX_COLOUR = /^#[0-9a-f]{6}$/i

function length(text) {
  return Array.from(text).length
}

export function textProblem(value, label, limit, { required = false, noun = "submission" } = {}) {
  if (typeof value !== "string") return `The ${label} has to be text.`
  const text = value.trim()
  if (required && !text) return `Give the ${noun} a ${label}.`
  if (length(text) > limit) return `The ${label} can be up to ${limit} characters.`
  return blockedWordProblem(label, text)
}

export function commonProblems(fields, noun) {
  const problems = {
    name: textProblem(fields.name, "name", SUBMISSION_LIMITS.name, { required: true, noun }),
    credit: textProblem(fields.credit, "credit", SUBMISSION_LIMITS.credit, { required: true, noun }),
    notes: textProblem(fields.notes ?? "", "notes", SUBMISSION_LIMITS.notes, { noun }),
    agree: fields.agree === true ? null : "Agree to the submission terms to send it."
  }
  return Object.fromEntries(Object.entries(problems).filter(([, problem]) => problem))
}

export function cleanCommon(fields) {
  return { name: fields.name.trim(), credit: fields.credit.trim(), notes: (fields.notes ?? "").replace(/\r\n?/g, "\n").trim() }
}

export function pngSize(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const signature = [137, 80, 78, 71, 13, 10, 26, 10]
  if (bytes.length < 24 || signature.some((value, index) => bytes[index] !== value) || view.getUint32(12) !== 0x49484452) return null
  return { width: view.getUint32(16), height: view.getUint32(20) }
}

export function sizedProblem(bytes, noun) {
  if (!bytes?.length) return `Choose the ${noun}'s file.`
  if (bytes.length > SUBMISSION_LIMITS.fileBytes) return `The file can be up to ${SUBMISSION_LIMITS.fileBytes / 1000000} MB.`
  return null
}

export function pngProblem(bytes, noun) {
  const problem = sizedProblem(bytes, noun)
  if (problem) return problem
  const size = pngSize(bytes)
  if (!size) return `The ${noun} has to be a PNG.`
  if (size.width > SUBMISSION_LIMITS.side || size.height > SUBMISSION_LIMITS.side) return `PNGs can be up to ${SUBMISSION_LIMITS.side} pixels on each side, and this one is ${size.width}x${size.height}.`
  return null
}

export function textureDensity(size, flat) {
  const density = size.width / flat.width
  return Number.isInteger(density) && density >= 1 && size.height === flat.height * density ? density : null
}

export function opaqueCells(rgba, width, height, density, minAlpha) {
  const columns = width / density
  const cells = new Uint8Array(columns * (height / density))
  for (let y = 0; y < height; y++) {
    const row = Math.floor(y / density) * columns
    for (let x = 0; x < width; x++) {
      if (rgba[(y * width + x) * 4 + 3] >= minAlpha) cells[row + Math.floor(x / density)] = 1
    }
  }
  return cells
}

export function templateScore(kind, cells, template) {
  let both = 0
  let either = 0
  let painted = 0
  for (let i = 0; i < cells.length; i++) {
    if (cells[i] && template[i]) both++
    if (cells[i] || template[i]) either++
    if (cells[i]) painted++
  }
  if (kind === "overlay") return painted ? both / painted : 0
  return either ? both / either : 0
}

export function assetId(name, taken) {
  const base = name.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "submission"
  let id = base
  for (let count = 2; taken.has(id); count++) id = `${base}_${count}`
  return id
}
