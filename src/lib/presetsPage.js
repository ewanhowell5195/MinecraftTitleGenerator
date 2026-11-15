import { reactive } from "vue"
import { navigate, onNavigated } from "./navigation.js"
import { TITLE_PARAM } from "./scene.js"

export const PRESETS_PATH = "/app/presets"
const PATH = PRESETS_PATH
const EDITOR = "/app/"

const FROM_EDITOR = "minecraft-title-presets-from-editor"

function rememberedFromEditor() {
  try {
    return performance.getEntriesByType("navigation")[0]?.type === "reload" && sessionStorage.getItem(FROM_EDITOR) === "true"
  } catch {
    return false
  }
}

export const presetsPage = reactive({ open: false, id: null, code: null, fromEditor: rememberedFromEditor() })

function setFromEditor(on) {
  presetsPage.fromEditor = on
  try {
    if (on) sessionStorage.setItem(FROM_EDITOR, "true")
    else sessionStorage.removeItem(FROM_EDITOR)
  } catch {}
}

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

function syncTo(url) {
  const { open, id } = readPresetPath(url.pathname)
  const code = open && id === null ? url.searchParams.get(TITLE_PARAM) : null
  Object.assign(presetsPage, { open, id, code })
}

function syncPresetsPage() {
  syncTo(new URL(location.href))
}

function go(path, replace) {
  syncTo(new URL(path, location.origin))
  navigate(path, { replace })
}

export function openPresetsPage() {
  returnTo = `${location.pathname}${location.search}${location.hash}`
  setFromEditor(true)
  go(PATH, false)
}

function showAddress(path, replace = presetsPage.id !== null || presetsPage.code !== null) {
  go(path, replace)
}

export function showPreset(id, { replace } = {}) {
  showAddress(id === null ? PATH : `${PATH}/${id}`, replace)
}

export function showOwnPreset(code) {
  showAddress(`${PATH}?${TITLE_PARAM}=${code}`)
}

export function openLinkInEditor(code) {
  go(`${EDITOR}?${TITLE_PARAM}=${code}`, true)
  returnTo = EDITOR
}

export function closePresetsPage(to = returnTo) {
  go(to, false)
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

let landing = false

onNavigated((to, from) => {
  syncPresetsPage()
  if (!presetsPage.open && presetsPage.fromEditor) setFromEditor(false)
  if (to.meta.name === "app" && from.meta.name !== "app") landing = presetsPage.open
})
