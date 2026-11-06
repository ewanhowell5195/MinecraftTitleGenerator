import MinecraftAssets from "minecraft-asset-loader"
import { reactive } from "vue"
import { image } from "./assets.js"
import { surface } from "./canvas.js"
import { titleCase } from "./names.js"
import { platform } from "./platform.js"

const BLOCK_TEXTURE = /^(?:assets\/minecraft\/)?textures\/blocks?\/([^/]+)\.png$/
const FIRST_BLOCK_FOLDER = Date.parse("2013-01-10T00:00:00+00:00")

const assets = new MinecraftAssets()
const JARS_KEY = "minecraft-title-saved-jars"
const loaded = new Map()

export const jar = reactive({ version: null, done: 0, total: 0 })

export function blockTexturePaths(paths) {
  const found = new Map()
  for (const path of paths) {
    const match = BLOCK_TEXTURE.exec(path)
    if (match) found.set(match[1], path)
  }
  return found
}

export function blockName(id) {
  return titleCase(id.replace(/([a-z])([A-Z0-9])/g, "$1 $2"))
}

export function pngSize(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return { width: view.getUint32(16), height: view.getUint32(20) }
}

export function usableVersions(versions) {
  return versions.filter(version => Date.parse(version.releaseTime) >= FIRST_BLOCK_FOLDER)
}

export async function listVersions() {
  const [versions, latest] = await Promise.all([assets.manifest.versions(), assets.manifest.latest()])
  return { versions: usableVersions(versions), latest: { release: latest.release?.id, snapshot: latest.snapshot?.id } }
}

export async function latestRelease() {
  return (await assets.manifest.latest()).release.id
}

export function isOpaque(pixels) {
  for (let at = 3; at < pixels.length; at += 4) {
    if (pixels[at] < 255) return false
  }
  return true
}

async function readTexture(bytes) {
  const { width, height } = pngSize(bytes)
  const bitmap = await platform.decodePng(bytes)
  const { canvas, ctx } = surface(width, Math.min(width, height), { willReadFrequently: true })
  ctx.drawImage(bitmap, 0, 0)
  bitmap.close?.()
  return { url: height > width ? canvas.toDataURL("image/png") : platform.pngUrl(bytes), opaque: isOpaque(ctx.getImageData(0, 0, canvas.width, canvas.height).data) }
}

async function readBlockTextures(version) {
  const found = blockTexturePaths((await assets.list({ version })).map(file => file.path))
  Object.assign(jar, { version, done: 0, total: 0 })
  try {
    await assets.loadJar({ version, onProgress: (done, total) => Object.assign(jar, { version, done, total: total ?? 0 }) })
  } finally {
    jar.version = null
  }
  return new Map(await Promise.all(Array.from(found, async ([id, path]) => [id, await readTexture(await assets.read(path, { version }))])))
}

export function savedJars() {
  try {
    return JSON.parse(platform.storage.getItem(JARS_KEY)) ?? []
  } catch {
    return []
  }
}

function rememberJar(version) {
  const saved = savedJars()
  if (saved.includes(version)) return
  try {
    platform.storage.setItem(JARS_KEY, JSON.stringify(saved.concat(version)))
  } catch (err) {
    console.error(err)
  }
}

export function blockTextures(version) {
  if (!loaded.has(version)) {
    const textures = readBlockTextures(version)
    loaded.set(version, textures)
    textures.then(() => rememberJar(version), () => loaded.delete(version))
  }
  return loaded.get(version)
}

async function answeredTextureImage(version, id) {
  const bytes = await platform.minecraftAsset({ id, version })
  if (!bytes) throw new Error(`Minecraft ${version} has no block texture called ${id}`)
  return image((await readTexture(bytes)).url)
}

export async function blockTextureImage(version, id) {
  if (platform.minecraftAsset) return answeredTextureImage(version ?? "latest", id)
  const resolved = version ?? await latestRelease()
  const texture = (await blockTextures(resolved)).get(id)
  if (!texture) throw new Error(`Minecraft ${resolved} has no block texture called ${id}`)
  return image(texture.url)
}
