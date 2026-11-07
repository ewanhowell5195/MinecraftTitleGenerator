import { reactive } from "vue"
import { TITLE_PARAM } from "./scene.js"

const PATH = "/app/presets"
const EDITOR = "/app/"

export const presetsPage = reactive({ open: false, id: null, code: null, fromEditor: false })

let returnTo = EDITOR

export function readPresetPath(path) {
  const match = path.match(/^\/app\/presets(?:\/(\d+))?\/?$/)
  if (!match) return { open: false, id: null }
  const id = Number(match[1])
  return { open: true, id: Number.isSafeInteger(id) && id > 0 ? id : null }
}

export function presetLink(id) {
  return `${location.origin}${PATH}/${id}`
}

export function syncPresetsPage() {
  const { open, id } = readPresetPath(location.pathname)
  const code = open && id === null ? new URLSearchParams(location.search).get(TITLE_PARAM) : null
  Object.assign(presetsPage, { open, id, code })
}

export function openPresetsPage() {
  returnTo = `${location.pathname}${location.search}${location.hash}`
  presetsPage.fromEditor = true
  history.pushState(null, "", PATH)
  syncPresetsPage()
}

function showAddress(path) {
  if (presetsPage.id !== null || presetsPage.code !== null) history.replaceState(null, "", path)
  else history.pushState(null, "", path)
  syncPresetsPage()
}

export function showPreset(id) {
  showAddress(id === null ? PATH : `${PATH}/${id}`)
}

export function showOwnPreset(code) {
  showAddress(`${PATH}?${TITLE_PARAM}=${code}`)
}

export function openLinkInEditor(code) {
  history.replaceState(null, "", `${EDITOR}?${TITLE_PARAM}=${code}`)
  syncPresetsPage()
  presetsPage.fromEditor = false
  returnTo = EDITOR
}

export function closePresetsPage(to = returnTo) {
  history.pushState(null, "", to)
  syncPresetsPage()
  presetsPage.fromEditor = false
  returnTo = EDITOR
}

export function leavePresetsForEditor() {
  closePresetsPage(EDITOR)
}

syncPresetsPage()
