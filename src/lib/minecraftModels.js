import * as THREE from "three"
import { gamePaths, keepTextures, readGameFile } from "./minecraft.js"
import { platform } from "./platform.js"
import { quadsOf } from "./modelQuads.js"

const LIBRARY = "https://cdn.jsdelivr.net/npm/block-model-renderer@3/dist/block-model-renderer.min.js"
const FOLDERS = { block: "assets/minecraft/blockstates/", item: "assets/minecraft/items/" }
const ITEM_MODELS = "assets/minecraft/models/item/"
const DEFAULT_STATES = ["assets/block-model-renderer/default_blockstates_preferred.json", "assets/block-model-renderer/default_blockstates.json"]
const THUMBNAIL = 96

const decoder = new TextDecoder()
let library = null
let drawing = false
const prepared = new Map()
const thumbnails = new Map()
const states = new Map()
const pending = []

function renderer() {
  library ??= import(/* @vite-ignore */ LIBRARY).then(lib => {
    lib.configure({ three: THREE })
    return lib
  })
  return library
}

function childNames(paths, dir) {
  const names = new Set()
  for (const path of paths) {
    if (path.startsWith(dir)) names.add(path.slice(dir.length).split("/")[0])
  }
  return Array.from(names)
}

async function prepare(version) {
  const [lib, paths] = await Promise.all([renderer(), gamePaths(version, "shapes")])
  const handler = {
    read: path => readGameFile(version, path),
    list: dir => childNames(paths, dir.endsWith("/") ? dir : `${dir}/`)
  }
  return { lib, paths, assets: await lib.prepareAssets([handler], { cache: true, version }) }
}

function gameModels(version) {
  if (!prepared.has(version)) {
    const game = platform.minecraftModels ? platform.minecraftModels(version) : prepare(version)
    prepared.set(version, game)
    game.catch(() => prepared.delete(version))
  }
  return prepared.get(version)
}

function idsIn(paths, dir) {
  return paths.filter(path => path.startsWith(dir) && path.endsWith(".json") && !path.slice(dir.length).includes("/")).map(path => path.slice(dir.length, -5)).sort()
}

function itemModel(name) {
  const path = name?.replace(/^minecraft:/, "") ?? ""
  return path.startsWith("item/") ? path.slice(5) : null
}

export function modelItems(models) {
  const ids = Object.keys(models)
  const variants = new Set(ids.flatMap(id => (models[id].overrides ?? []).map(override => itemModel(override.model)).filter(name => name !== id)))
  const parents = new Set(ids.filter(id => !variants.has(id)).map(id => itemModel(models[id].parent)))
  function template(id) {
    const { parent, textures } = models[id]
    return id.startsWith("template_") || parents.has(id) && !Object.keys(textures ?? {}).length && (parent === "builtin/generated" || !!itemModel(parent))
  }
  return ids.filter(id => !variants.has(id) && !template(id))
}

async function itemsFromModels(version, paths) {
  const read = idsIn(paths, ITEM_MODELS).map(async id => [id, JSON.parse(decoder.decode(await readGameFile(version, `${ITEM_MODELS}${id}.json`)))])
  return modelItems(Object.fromEntries(await Promise.all(read)))
}

export async function modelList(version) {
  const { paths } = await gameModels(version)
  const item = idsIn(paths, FOLDERS.item)
  return { block: idsIn(paths, FOLDERS.block), item: item.length ? item : await itemsFromModels(version, paths) }
}

async function drawThumbnail({ kind, id, version }) {
  const { lib, assets } = await gameModels(version)
  const canvas = await (kind === "block" ? lib.renderBlock : lib.renderItem)({ id, assets, width: THUMBNAIL, height: THUMBNAIL })
  return canvas.toDataURL("image/png")
}

async function drawPending() {
  if (drawing) return
  drawing = true
  while (pending.length) {
    const request = pending.pop()
    await drawThumbnail(request).then(request.fulfil, request.reject)
  }
  drawing = false
}

function thumbnailKey(kind, id, version) {
  return `${version}/${kind}/${id}`
}

export function modelThumbnail(kind, id, version) {
  const key = thumbnailKey(kind, id, version)
  const waiting = pending.find(request => request.key === key)
  if (waiting) waiting.wanted++
  if (!thumbnails.has(key)) {
    const url = new Promise((fulfil, reject) => pending.push({ key, kind, id, version, wanted: 1, fulfil, reject }))
    thumbnails.set(key, url)
    url.catch(() => thumbnails.delete(key))
    drawPending()
  }
  return thumbnails.get(key)
}

export function dropThumbnail(kind, id, version) {
  const key = thumbnailKey(kind, id, version)
  const at = pending.findIndex(request => request.key === key)
  if (at === -1 || --pending[at].wanted) return
  pending.splice(at, 1)
  thumbnails.delete(key)
}

export function keepVersions(versions) {
  keepTextures(versions)
  for (const version of Array.from(prepared.keys())) {
    if (!versions.has(version)) prepared.delete(version)
  }
  for (const key of Array.from(thumbnails.keys())) {
    if (!versions.has(key.slice(0, key.indexOf("/"))) && !pending.some(request => request.key === key)) thumbnails.delete(key)
  }
  for (const key of Array.from(states.keys())) {
    if (!versions.has(key.slice(0, key.indexOf("/")))) states.delete(key)
  }
}

function addValues(found, name, value) {
  if (!found.has(name)) found.set(name, [])
  const values = found.get(name)
  for (const part of String(value).split("|")) {
    if (!values.includes(part)) values.push(part)
  }
}

export function stateValues(json) {
  const found = new Map()
  for (const key of Object.keys(json.variants ?? {})) {
    for (const pair of key.split(",")) {
      const [name, value] = pair.split("=").map(part => part.trim())
      if (name && value) addValues(found, name, value)
    }
  }
  function walk(when) {
    if (!when) return
    const group = when.OR ?? when.AND
    if (group) group.forEach(walk)
    else for (const [name, value] of Object.entries(when)) addValues(found, name, value)
  }
  for (const part of json.multipart ?? []) walk(part.when)
  return found
}

function ordered(values) {
  if (values.every(value => value === "true" || value === "false")) return ["false", "true"]
  if (values.every(value => /^\d+$/.test(value))) return values.toSorted((a, b) => a - b)
  return values
}

function ruleDefaults(table, id) {
  return table.blocks?.find(rule => rule.match?.split("|").some(pattern => new RegExp(`^${pattern.replaceAll("*", ".*")}$`).test(id)))?.defaults ?? {}
}

export function stateDefault(tables, id, name, values) {
  const candidates = tables.map(table => ruleDefaults(table, id)[name]).concat(tables.map(table => table.properties?.[name])).flat()
  return candidates.map(String).find(value => values.includes(value)) ?? values[0]
}

export function stateList(json, tables, id, waterloggable = false) {
  const found = stateValues(json)
  const game = ruleDefaults(tables.at(-1) ?? {}, id)
  for (const name of found.keys()) {
    if (game[name] != null) addValues(found, name, game[name])
  }
  if (waterloggable) addValues(found, "waterlogged", "false|true")
  return Array.from(found, ([name, values]) => [name, ordered(values)]).filter(([, values]) => values.length > 1).map(([name, values]) => ({ name, values, value: stateDefault(tables, id, name, values) }))
}

async function readJson(lib, assets, path) {
  const file = await lib.readFile(assets, path)
  return file ? JSON.parse(decoder.decode(file)) : {}
}

async function readStates(id, version) {
  const { lib, assets } = await gameModels(version)
  const [json, ...tables] = await Promise.all([`${FOLDERS.block}${id}.json`].concat(DEFAULT_STATES).map(path => readJson(lib, assets, path)))
  return stateList(json, tables, id, lib.isWaterloggable(id))
}

async function readDefinition(id, version) {
  const { lib, assets } = await gameModels(version)
  const file = await lib.readFile(assets, `${FOLDERS.item}${id}.json`)
  return { definition: file ? JSON.parse(decoder.decode(file)) : null, potions: Object.keys(lib.COLORS?.potions ?? {}) }
}

function cached(key, read) {
  if (!states.has(key)) {
    const loading = read()
    states.set(key, loading)
    loading.catch(() => states.delete(key))
  }
  return states.get(key)
}

export function blockStates(id, version) {
  return cached(`${version}/block/${id}`, () => readStates(id, version))
}

export function itemDefinition(id, version) {
  return cached(`${version}/item/${id}`, () => readDefinition(id, version))
}

export function fitState(list, previous) {
  return Object.fromEntries(list.map(({ name, values, value }) => [name, values.includes(previous?.[name]) ? previous[name] : value]))
}

async function modelGroup(kind, id, version, state) {
  const { lib, assets } = await gameModels(version)
  const refs = kind === "block" ? await lib.parseBlockstate(assets, id, state ? { properties: state } : undefined) : await lib.parseItemDefinition(assets, id, { display: "gui", ...(state && { components: state }) })
  if (!refs.length) throw new Error(`Minecraft has no model for the ${kind} ${id}`)
  const group = new THREE.Group()
  for (const ref of refs) {
    const data = await lib.resolveModelData(assets, ref)
    const model = await lib.loadModel(assets, data, { lighting: "off" })
    model.userData.flat = !!data.generated
    group.add(model)
  }
  group.updateMatrixWorld(true)
  return group
}

export async function minecraftQuads(kind, id, version, state = null) {
  const model = quadsOf(await modelGroup(kind, id, version, state))
  if (!model.quads.length) throw new Error(`Minecraft's ${kind} ${id} has nothing to draw`)
  return model
}
