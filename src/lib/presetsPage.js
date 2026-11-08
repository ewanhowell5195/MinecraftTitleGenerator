import { reactive } from "vue"
import { TITLE_PARAM } from "./scene.js"

const PATH = "/app/presets"
const EDITOR = "/app/"

export const presetsPage = reactive({ open: false, id: null, code: null })

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
  history.pushState(null, "", PATH)
  syncPresetsPage()
}

function showAddress(path, replace = presetsPage.id !== null || presetsPage.code !== null) {
  if (replace) history.replaceState(null, "", path)
  else history.pushState(null, "", path)
  syncPresetsPage()
}

export function showPreset(id, { replace } = {}) {
  showAddress(id === null ? PATH : `${PATH}/${id}`, replace)
}

export function showOwnPreset(code) {
  showAddress(`${PATH}?${TITLE_PARAM}=${code}`)
}

export function openLinkInEditor(code) {
  history.replaceState(null, "", `${EDITOR}?${TITLE_PARAM}=${code}`)
  syncPresetsPage()
  returnTo = EDITOR
}

export function closePresetsPage(to = returnTo) {
  history.pushState(null, "", to)
  syncPresetsPage()
  returnTo = EDITOR
}

export function leavePresetsForEditor() {
  closePresetsPage(EDITOR)
}

export function takeLanding() {
  const landed = landing
  landing = false
  return landed
}

syncPresetsPage()
let landing = presetsPage.open
