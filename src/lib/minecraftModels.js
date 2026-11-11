import * as THREE from "three"
import { gamePaths, readGameFile } from "./minecraft.js"
import { platform } from "./platform.js"
import { quadsOf } from "./modelQuads.js"

const LIBRARY = "https://cdn.jsdelivr.net/npm/block-model-renderer@2/dist/block-model-renderer.min.js"
const FOLDERS = { block: "assets/minecraft/blockstates/", item: "assets/minecraft/items/" }
const THUMBNAIL = 96

let library = null
let queue = Promise.resolve()
const prepared = new Map()
const thumbnails = new Map()

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

function queued(task) {
  const result = queue.then(task)
  queue = result.catch(() => {})
  return result
}

export function modelThumbnail(kind, id, version) {
  const key = `${version}/${kind}/${id}`
  if (!thumbnails.has(key)) {
    const url = queued(async () => {
      const { lib, assets } = await gameModels(version)
      const canvas = await (kind === "block" ? lib.renderBlock : lib.renderItem)({ id, assets, width: THUMBNAIL, height: THUMBNAIL })
      return canvas.toDataURL("image/png")
    })
    thumbnails.set(key, url)
    url.catch(() => thumbnails.delete(key))
  }
  return thumbnails.get(key)
}

async function modelGroup(kind, id, version) {
  const { lib, assets } = await gameModels(version)
  const refs = kind === "block" ? await lib.parseBlockstate(assets, id) : await lib.parseItemDefinition(assets, id, { display: "gui" })
  if (!refs.length) throw new Error(`Minecraft has no model for the ${kind} ${id}`)
  const group = new THREE.Group()
  for (const ref of refs) group.add(await lib.loadModel(null, assets, await lib.resolveModelData(assets, ref), { lighting: "off" }))
  group.updateMatrixWorld(true)
  return group
}

export async function minecraftQuads(kind, id, version) {
  return quadsOf(await modelGroup(kind, id, version))
}
