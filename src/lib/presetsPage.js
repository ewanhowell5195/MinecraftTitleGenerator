import { reactive } from "vue"
import { navigate, onNavigated } from "./navigation.js"
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
  if (to.meta.name === "app" && from.meta.name !== "app") landing = presetsPage.open
})
