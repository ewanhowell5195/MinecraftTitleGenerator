import * as THREE from "three"
import { gamePaths, keepTextures, readGameFile } from "./minecraft.js"
import { platform } from "./platform.js"
import { quadsOf } from "./modelQuads.js"

const LIBRARY = "https://cdn.jsdelivr.net/npm/block-model-renderer@3/dist/block-model-renderer.min.js"
const FOLDERS = { block: "assets/minecraft/blockstates/", item: "assets/minecraft/items/" }
const THUMBNAIL = 96

let library = null
let drawing = false
const prepared = new Map()
const thumbnails = new Map()
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
  return { lib, paths, assets: await lib.prepareAssets([handler], { cache: true }) }
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

export async function modelList(version) {
  const { paths } = await gameModels(version)
  return { block: idsIn(paths, FOLDERS.block), item: idsIn(paths, FOLDERS.item) }
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
}

async function modelGroup(kind, id, version) {
  const { lib, assets } = await gameModels(version)
  const refs = kind === "block" ? await lib.parseBlockstate(assets, id) : await lib.parseItemDefinition(assets, id, { display: "gui" })
  if (!refs.length) throw new Error(`Minecraft has no model for the ${kind} ${id}`)
  const group = new THREE.Group()
  for (const ref of refs) group.add(await lib.loadModel(assets, await lib.resolveModelData(assets, ref), { lighting: "off" }))
  group.updateMatrixWorld(true)
  return group
}

export async function minecraftQuads(kind, id, version) {
  const model = quadsOf(await modelGroup(kind, id, version))
  if (!model.quads.length) throw new Error(`Minecraft's ${kind} ${id} has nothing to draw`)
  return model
}
