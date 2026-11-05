import { reactive } from "vue"

const PATH = "/app/presets"
const EDITOR = "/app/"

export const presetsPage = reactive({ open: false, id: null })

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
  Object.assign(presetsPage, readPresetPath(location.pathname))
}

export function openPresetsPage() {
  returnTo = `${location.pathname}${location.search}${location.hash}`
  history.pushState(null, "", PATH)
  syncPresetsPage()
}

export function showPreset(id, { replace = presetsPage.id !== null } = {}) {
  const path = id === null ? PATH : `${PATH}/${id}`
  if (replace) history.replaceState(null, "", path)
  else history.pushState(null, "", path)
  syncPresetsPage()
}

export function closePresetsPage(to = returnTo) {
  history.pushState(null, "", to)
  syncPresetsPage()
  returnTo = EDITOR
}

export function leavePresetsForEditor() {
  closePresetsPage(EDITOR)
}

syncPresetsPage()
