import { computed, ref, shallowRef, watch } from "vue"
import { authorList } from "../lib/core/authors.js"
import { DEFAULT_ORDER } from "../lib/font/order.js"
import { charactersOf, sameCharacter, setLetterCase } from "../lib/font/editor/characters.js"
import { depthCode, depthOf } from "../lib/font/editor/depths.js"
import { flatTexture, savedJson, stripTexture } from "../lib/font/editor/export.js"
import { glyphOf, sameGlyph, setGlyph } from "../lib/font/editor/glyph.js"
import { moveGlyph, reshapeGlyph } from "../lib/font/editor/glyphEditing.js"
import { buildSheet } from "../lib/font/editor/sheet.js"
import { fitGlyph } from "../lib/font/editor/sizes.js"
import { jsonText } from "../lib/core/jsonText.js"
import { EDITOR_EDIT, EDITOR_REVISION, EDITOR_SUBMISSION } from "../lib/submissions/submissions.js"
import { askOverwrite, submission } from "../lib/submissions/submissionsApi.js"
import { fontFromUploads } from "./loaders.js"
import { download, downloadBlob } from "../lib/core/files.js"
import { pngUrl } from "../lib/core/virtualFiles.js"
import { navigate } from "../lib/state/navigation.js"

const STORAGE_KEY = "minecraft-title-font-editor"
export const START_PATH = "/font-editor/"
export const EDITOR_PATH = "/font-editor/editor"
export const IMPORT_PATH = "/font-editor/import"
const HISTORY_LIMIT = 200
const SAVE_DELAY = 300

export const font = shallowRef(null)
export const selected = ref(Array.from(DEFAULT_ORDER)[1])
export const arrowsMove = ref("drawing")
export const saveError = ref("")
export const clipboard = shallowRef(null)
export const DEFAULT_PREVIEW = "Minecraft"
export const previewText = ref(DEFAULT_PREVIEW)
export const previewShown = computed(() => previewText.value.trim() ? previewText.value : DEFAULT_PREVIEW)
export const previewTerminators = ref(false)
export const previewStretch = ref(0)
export const pencilDepth = ref(100)
export const previewMode = ref("2d")
export const kerningFilter = ref("all")
export const editingSubmission = ref(null)
export const openingSubmission = ref(false)
export const submissionError = ref("")
export const importing = shallowRef(null)
export const pendingFont = shallowRef(null)
export const opened = ref(0)

const undoStack = shallowRef([])
const redoStack = shallowRef([])
let offCanvas = new WeakMap()
let group = null
let saveTimer = null
let strokeStart = null

export const canUndo = computed(() => undoStack.value.length > 0)
export const canRedo = computed(() => redoStack.value.length > 0)
export const characters = computed(() => font.value ? charactersOf(font.value) : [])
export const glyph = computed(() => font.value ? glyphOf(font.value, selected.value) : null)

function remember() {
  undoStack.value = undoStack.value.concat([font.value]).slice(-HISTORY_LIMIT)
  redoStack.value = []
}

export function update(next, key = null) {
  if (!key || key !== group) remember()
  group = key
  font.value = next
}

export function beginStroke() {
  strokeStart = { font: font.value, redo: redoStack.value, char: selected.value }
  remember()
  group = null
}

export function cancelStroke() {
  if (!strokeStart) return
  font.value = strokeStart.font
  undoStack.value = undoStack.value.slice(0, -1)
  redoStack.value = strokeStart.redo
  strokeStart = null
}

export function endStroke() {
  if (!strokeStart) return
  if (sameGlyph(glyphOf(strokeStart.font, strokeStart.char), glyphOf(font.value, strokeStart.char))) cancelStroke()
  strokeStart = null
}

export function typing(target) {
  return target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
}

export function inkCode() {
  const { font: next, code } = depthCode(font.value, pencilDepth.value / 100)
  if (next !== font.value) font.value = next
  const drawn = depthOf(next, code) * 100
  if (Math.abs(drawn - pencilDepth.value) > 1e-6) pencilDepth.value = drawn
  return code
}

export function strokeTo(next) {
  const before = glyph.value
  font.value = next
  carryOutside(before, glyph.value)
}

export function updateGlyph(next, key = null, outside = null) {
  const before = glyph.value
  if (!sameGlyph(before, next)) update(setGlyph(font.value, selected.value, next), key)
  if (outside) offCanvas.set(glyph.value, outside)
  else carryOutside(before, glyph.value)
}

function carryOutside(before, after) {
  if (after !== before && offCanvas.has(before) && !offCanvas.has(after)) offCanvas.set(after, offCanvas.get(before))
}

export function moveSelected(dx, dy) {
  const { glyph: moved, outside } = moveGlyph(font.value, glyph.value, dx, dy, offCanvas.get(glyph.value))
  updateGlyph(moved, `${selected.value}.move`, outside)
}

export function reshapeSelected(change, key = null) {
  const { font: next, outside } = reshapeGlyph(font.value, selected.value, change, offCanvas.get(glyph.value))
  if (sameGlyph(glyphOf(next, selected.value), glyph.value)) return
  update(next, key)
  offCanvas.set(glyph.value, outside)
}

export function changeLetterCase(letterCase) {
  const from = font.value.letterCase
  update(setLetterCase(font.value, letterCase))
  selected.value = sameCharacter(selected.value, from, letterCase)
}

export function copyGlyph(char) {
  clipboard.value = { font: font.value, glyph: glyphOf(font.value, char) }
}

export function pasteGlyph(char) {
  const { font: from, glyph: copied } = clipboard.value
  const fitted = fitGlyph(from, copied, font.value)
  let next = font.value
  const codes = new Map([["0", "0"]])
  for (const code of new Set(fitted.rows.join(""))) {
    if (codes.has(code)) continue
    const found = depthCode(next, depthOf(from, code))
    next = found.font
    codes.set(code, found.code)
  }
  update(setGlyph(next, char, { ...fitted, rows: fitted.rows.map(row => Array.from(row, code => codes.get(code)).join("")) }))
}

export function undo() {
  if (strokeStart || !canUndo.value) return
  redoStack.value = redoStack.value.concat([font.value])
  font.value = undoStack.value[undoStack.value.length - 1]
  undoStack.value = undoStack.value.slice(0, -1)
  group = null
  keepSelection()
}

export function redo() {
  if (strokeStart || !canRedo.value) return
  undoStack.value = undoStack.value.concat([font.value])
  font.value = redoStack.value[redoStack.value.length - 1]
  redoStack.value = redoStack.value.slice(0, -1)
  group = null
  keepSelection()
}

function keepSelection() {
  if (!characters.value.includes(selected.value)) selected.value = characters.value[0]
}

export function openFont(next, submission = null) {
  font.value = next
  editingSubmission.value = submission
  undoStack.value = []
  redoStack.value = []
  group = null
  strokeStart = null
  saveError.value = ""
  submissionError.value = ""
  arrowsMove.value = "drawing"
  previewText.value = DEFAULT_PREVIEW
  previewTerminators.value = false
  previewStretch.value = 0
  pencilDepth.value = 100
  previewMode.value = "2d"
  selected.value = charactersOf(next).find(char => /[a-z]/i.test(char)) ?? charactersOf(next)[0]
  opened.value++
}

function showFont(next, submission = null) {
  openFont(next, submission)
  navigate(EDITOR_PATH)
}

export function startFont(next) {
  if (font.value) pendingFont.value = next
  else showFont(next)
}

export function replaceFont() {
  const next = pendingFont.value
  pendingFont.value = null
  showFont(next)
}

function save() {
  if (!font.value) return
  try {
    const kerning = Object.fromEntries(Object.entries(font.value.kerning).filter(([, amount]) => amount))
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, font: { ...font.value, kerning }, selected: selected.value, ...(editingSubmission.value && { submission: editingSubmission.value }) }))
    saveError.value = ""
  } catch (err) {
    saveError.value = `This browser couldn't remember your font (${err.message}). Download it so you don't lose it.`
  }
}

export function restoreFont() {
  const text = localStorage.getItem(STORAGE_KEY)
  if (!text) return
  const saved = JSON.parse(text)
  if (saved.version !== 1) throw new Error(`the saved font is version ${saved.version}, which this editor can't read`)
  font.value = { ...saved.font, authors: authorList(saved.font.authors ?? saved.font.author), creeper: saved.font.creeper ?? true, extras: saved.font.extras ?? [], letterCase: saved.font.letterCase ?? "upper" }
  selected.value = saved.selected
  editingSubmission.value = saved.submission ?? null
  keepSelection()
}

export async function takeSubmissionFont() {
  const saved = sessionStorage.getItem(EDITOR_EDIT)
  if (!saved) return
  sessionStorage.removeItem(EDITOR_EDIT)
  const { submission, text } = JSON.parse(saved)
  openingSubmission.value = true
  submissionError.value = ""
  try {
    openFont(await fontFromUploads([new File([text], "font.json", { type: "application/json" })]), submission)
    await navigate(EDITOR_PATH, { replace: true })
  } catch (err) {
    submissionError.value = `The submission's font couldn't be opened: ${err.message}`
    await navigate(START_PATH, { replace: true })
  } finally {
    openingSubmission.value = false
  }
}

watch([font, selected], () => {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(save, SAVE_DELAY)
})

watch(selected, () => {
  offCanvas = new WeakMap()
})

export function flushSave() {
  clearTimeout(saveTimer)
  save()
}

export function downloadFlatTexture() {
  download("flat.png", pngUrl(flatTexture(font.value)))
}

export function downloadStripTexture() {
  download("strip.png", pngUrl(stripTexture(font.value)))
}

export function downloadTexture() {
  download("font.png", pngUrl(buildSheet(font.value)))
}

function jsonFile() {
  const entry = savedJson(font.value, pngUrl)
  return { name: `${entry.id}.json`, text: jsonText(entry) + "\n" }
}

export function downloadJson() {
  const { name, text } = jsonFile()
  downloadBlob(name, new Blob([text], { type: "application/json" }))
}

async function overwriteAllowed(id) {
  const opened = JSON.parse(sessionStorage.getItem(EDITOR_REVISION) ?? "null")
  if (opened?.submission !== id) return true
  const latest = (await submission(id)).updatedAt
  if (latest === opened.revision) return true
  if (!await askOverwrite()) return false
  sessionStorage.setItem(EDITOR_REVISION, JSON.stringify({ submission: id, revision: latest }))
  return true
}

export async function saveSubmission() {
  flushSave()
  const id = editingSubmission.value
  try {
    if (!await overwriteAllowed(id)) return
  } catch (err) {
    saveError.value = `Your submission couldn't be checked before saving: ${err.message}`
    return
  }
  sessionStorage.setItem(EDITOR_SUBMISSION, JSON.stringify({ ...jsonFile(), submission: id, save: true }))
  navigate(`/submissions/${id}/edit`)
}

export function submitFont() {
  flushSave()
  sessionStorage.setItem(EDITOR_SUBMISSION, JSON.stringify(jsonFile()))
  navigate("/submit/?type=font&from=editor")
}
