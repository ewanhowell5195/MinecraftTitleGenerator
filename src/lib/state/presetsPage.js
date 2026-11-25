import { reactive } from "vue"
import { navigate, onNavigated } from "./navigation.js"
import { PRESET_PARAM, TITLE_PARAM, replaceAddress, sharedLink } from "./scene.js"
import { PRESETS_PATH, presetPath } from "../presets/presetPath.js"
import { SITE } from "#src/site/pages.js"

const EDITOR = "/app/"

const FROM_EDITOR = "minecraft-title-presets-from-editor"
const SORT_PARAM = "sort"
const SEARCH_PARAM = "search"
const PRESET_SORTS = ["week", "popular", "top", "new", "needs"]
const DEFAULT_SORT = PRESET_SORTS[0]

function rememberedFromEditor() {
  try {
    return performance.getEntriesByType("navigation")[0]?.type === "reload" && sessionStorage.getItem(FROM_EDITOR) === "true"
  } catch {
    return false
  }
}

export const presetsPage = reactive({ open: false, id: null, code: null, sort: DEFAULT_SORT, search: "", filtersShown: true, fromEditor: rememberedFromEditor() })

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
  return `${location.origin}${presetPath(id)}`
}

function syncTo(url) {
  const { open, id } = readPresetPath(url.pathname)
  const code = open && id === null ? url.searchParams.get(TITLE_PARAM) : null
  const sort = url.searchParams.get(SORT_PARAM)
  Object.assign(presetsPage, { open, id, code }, open && presetsPage.filtersShown && { sort: PRESET_SORTS.includes(sort) ? sort : DEFAULT_SORT, search: url.searchParams.get(SEARCH_PARAM) ?? "" })
}

function filtered(path) {
  const url = new URL(path, location.origin)
  if (!readPresetPath(url.pathname).open) return path
  if (presetsPage.filtersShown && presetsPage.sort !== DEFAULT_SORT) url.searchParams.set(SORT_PARAM, presetsPage.sort)
  else url.searchParams.delete(SORT_PARAM)
  if (presetsPage.filtersShown && presetsPage.search) url.searchParams.set(SEARCH_PARAM, presetsPage.search)
  else url.searchParams.delete(SEARCH_PARAM)
  return `${url.pathname}${url.search}${url.hash}`
}

function go(path, replace) {
  const address = filtered(path)
  syncTo(new URL(address, location.origin))
  navigate(address, { replace })
}

export function setPresetSort(sort) {
  if (!PRESET_SORTS.includes(sort)) throw new Error(`there is no preset sort called ${sort}`)
  if (sort === presetsPage.sort) return
  presetsPage.sort = sort
  go(`${location.pathname}${location.search}`, true)
}

export function addressHasFilters(search = location.search) {
  const params = new URLSearchParams(search)
  return params.has(SORT_PARAM) || params.has(SEARCH_PARAM)
}

export function showPresetFilters(on) {
  if (on === presetsPage.filtersShown) return
  presetsPage.filtersShown = on
  go(`${location.pathname}${location.search}`, true)
}

export function setPresetSearch(search) {
  if (search === presetsPage.search) return
  presetsPage.search = search
  go(`${location.pathname}${location.search}`, true)
}

export function openPresetsPage() {
  returnTo = `${location.pathname}${location.search}${location.hash}`
  setFromEditor(true)
  go(PRESETS_PATH, false)
}

function showAddress(path, replace = presetsPage.id !== null || presetsPage.code !== null) {
  go(path, replace)
}

export function showPreset(id, { replace } = {}) {
  showAddress(id === null ? PRESETS_PATH : presetPath(id), replace)
}

export function showOwnPreset(code) {
  showAddress(`${PRESETS_PATH}?${TITLE_PARAM}=${code}`)
}

export function openLinkInEditor(code) {
  go(`${EDITOR}?${TITLE_PARAM}=${code}`, true)
  returnTo = EDITOR
}

export function closePresetsPage(to = returnTo) {
  go(to, false)
  returnTo = EDITOR
}

export function editorPresetPath(id) {
  return `${EDITOR}?${PRESET_PARAM}=${id}`
}

export function leavePresetsForEditor() {
  closePresetsPage(sharedLink.preset === null ? EDITOR : editorPresetPath(sharedLink.preset))
}

function editorAddress(address) {
  const url = new URL(address, location.origin)
  if (!sharedLink.open) url.searchParams.delete(TITLE_PARAM)
  if (sharedLink.preset === null) url.searchParams.delete(PRESET_PARAM)
  else url.searchParams.set(PRESET_PARAM, sharedLink.preset)
  return `${url.pathname}${url.search}${url.hash}`
}

function showEditorAddress(shown) {
  const address = editorAddress(shown)
  if (address !== shown) replaceAddress(new URL(address, location.origin))
}

export function takeLanding() {
  const landed = landing
  landing = false
  return landed
}

let landing = false

onNavigated((to, from) => {
  const fromEditor = from.meta.name === "app" && !readPresetPath(from.path).open
  syncTo(new URL(to.fullPath, SITE))
  if (presetsPage.open && fromEditor) {
    returnTo = editorAddress(from.fullPath)
    if (!presetsPage.fromEditor) setFromEditor(true)
  } else if (!presetsPage.open && presetsPage.fromEditor) setFromEditor(false)
  if (to.meta.name === "app" && !presetsPage.open && from.meta.name === "app") showEditorAddress(to.fullPath)
  if (to.meta.name === "app" && from.meta.name !== "app") landing = presetsPage.open
})
