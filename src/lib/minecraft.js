import MinecraftAssets from "minecraft-asset-loader"
import { reactive } from "vue"
import { image } from "./assets.js"
import { blockTints, grassColormapPixel } from "./blockTints.js"
import { surface } from "./canvas.js"
import { agreeToEula } from "./eula.js"
import { titleCase } from "./names.js"
import { platform } from "./platform.js"

const BLOCK_TEXTURE = /^(?:assets\/minecraft\/)?textures\/blocks?\/([^/]+)\.png$/
const FIRST_BLOCK_FOLDER = Date.parse("2013-01-10T00:00:00+00:00")
const GRASS_COLORMAP = "assets/minecraft/textures/colormap/grass.png"
const RANGE_REFUSED = /^Ranged request refused/

const assets = new MinecraftAssets()
const loaded = new Map()
const games = new Map()

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

function tintedUrl(canvas, tint) {
  const { canvas: out, ctx } = surface(canvas.width, canvas.height)
  ctx.drawImage(canvas, 0, 0)
  ctx.globalCompositeOperation = "multiply"
  ctx.fillStyle = tint
  ctx.fillRect(0, 0, out.width, out.height)
  ctx.globalCompositeOperation = "destination-in"
  ctx.drawImage(canvas, 0, 0)
  return out.toDataURL("image/png")
}

async function readTexture(bytes, tint = null) {
  const { width, height } = pngSize(bytes)
  const bitmap = await platform.decodePng(bytes)
  const { canvas, ctx } = surface(width, Math.min(width, height), { willReadFrequently: true })
  ctx.drawImage(bitmap, 0, 0)
  bitmap.close?.()
  const url = height > width ? canvas.toDataURL("image/png") : platform.pngUrl(bytes)
  return { url, preview: tint ? tintedUrl(canvas, tint) : url, opaque: isOpaque(ctx.getImageData(0, 0, canvas.width, canvas.height).data), tint }
}

async function colormapReader(version) {
  const bitmap = await platform.decodePng(await assets.read(GRASS_COLORMAP, { version }))
  const { ctx } = surface(bitmap.width, bitmap.height, { willReadFrequently: true })
  ctx.drawImage(bitmap, 0, 0)
  bitmap.close?.()
  return (temperature, downfall) => {
    const { x, y } = grassColormapPixel(temperature, downfall)
    return Array.from(ctx.getImageData(x, y, 1, 1).data.subarray(0, 3))
  }
}

// Chrome's HTTP cache can answer a ranged request for the jar with another range it already holds, and asking again gets the right one
async function ranged(read) {
  try {
    return await read()
  } catch (err) {
    if (!RANGE_REFUSED.test(err.message)) throw err
    return read()
  }
}

async function downloadGame(version, reason) {
  await agreeToEula(reason)
  const paths = (await ranged(() => assets.list({ version }))).map(file => file.path)
  Object.assign(jar, { version, done: 0, total: 0 })
  try {
    await ranged(() => assets.loadJar({ version, onProgress: (done, total) => Object.assign(jar, { version, done, total: total ?? 0 }) }))
  } finally {
    jar.version = null
  }
  return paths
}

export function gamePaths(version, reason = "tileables") {
  if (!games.has(version)) {
    const paths = downloadGame(version, reason)
    games.set(version, paths)
    paths.catch(() => games.delete(version))
  }
  return games.get(version)
}

export function readGameFile(version, path) {
  return assets.read(path, { version })
}

async function readBlockTextures(version) {
  const paths = await gamePaths(version)
  const found = blockTexturePaths(paths)
  let colormap = null
  const tints = await blockTints(new Set(paths), async file => JSON.parse(new TextDecoder().decode(await assets.read(file, { version }))), async (temperature, downfall) => (colormap ??= await colormapReader(version))(temperature, downfall))
  return new Map(await Promise.all(Array.from(found, async ([id, path]) => [id, await readTexture(await assets.read(path, { version }), tints.get(id) ?? null)])))
}

export function keepTextures(versions) {
  for (const version of Array.from(loaded.keys())) {
    if (!versions.has(version)) loaded.delete(version)
  }
}

export function blockTextures(version) {
  if (!loaded.has(version)) {
    const textures = readBlockTextures(version)
    loaded.set(version, textures)
    textures.catch(() => loaded.delete(version))
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
