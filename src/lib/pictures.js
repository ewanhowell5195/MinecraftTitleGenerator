import { decodeTitle } from "./linkformat.js"
import { savedJars } from "./minecraft.js"
import { renderPicture } from "./titlePicture.js"

const DATABASE = "minecraft-title-pictures"
const RENDERER_VERSION = 4
const PICTURES_KEPT = 500

const finished = new Map()
const waiting = []
const hurrying = new Set()
let running = false
let database = null

function wordsOf(line) {
  return line.words ? line.words.map(word => ({ ...line, ...word })) : [line]
}

export function minecraftVersions(lines) {
  const versions = lines.flatMap(wordsOf).filter(word => word.textureSource === "tileable" && word.tileableSource === "minecraft").map(word => word.minecraftVersion ?? "latest")
  return Array.from(new Set(versions))
}

export function missingJars(code) {
  const saved = new Set(savedJars())
  return minecraftVersions(decodeTitle(code).lines).filter(version => !saved.has(version))
}

async function next() {
  if (running || !waiting.length) return
  running = true
  const job = waiting.shift()
  try {
    job.fulfil(await renderPicture(job.code))
  } catch (err) {
    job.reject(err)
  }
  running = false
  next()
}

function openDatabase() {
  database ??= new Promise((fulfil, reject) => {
    const opening = indexedDB.open(DATABASE, RENDERER_VERSION)
    opening.onupgradeneeded = () => {
      if (opening.result.objectStoreNames.contains("pictures")) opening.result.deleteObjectStore("pictures")
      opening.result.createObjectStore("pictures", { keyPath: "code" }).createIndex("at", "at")
    }
    opening.onsuccess = () => {
      opening.result.onversionchange = () => opening.result.close()
      fulfil(opening.result)
    }
    opening.onerror = () => reject(opening.error)
    opening.onblocked = () => reject(new Error("another tab has the old title pictures open"))
  })
  return database
}

function asked(request) {
  return new Promise((fulfil, reject) => {
    request.onsuccess = () => fulfil(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function storedPicture(code) {
  try {
    const { image } = await asked((await openDatabase()).transaction("pictures").objectStore("pictures").get(code)) ?? {}
    return image ?? null
  } catch (err) {
    console.error(err)
    return null
  }
}

async function storePicture(code, image) {
  try {
    const store = (await openDatabase()).transaction("pictures", "readwrite").objectStore("pictures")
    store.put({ code, image, at: Date.now() })
    const over = await asked(store.count()) - PICTURES_KEPT
    if (over <= 0) return
    const oldest = await asked(store.index("at").getAllKeys(null, over))
    for (const key of oldest) store.delete(key)
  } catch (err) {
    console.error(err)
  }
}

export async function hasPicture(code) {
  return finished.has(code) || await storedPicture(code) !== null
}

function rendered(code) {
  return new Promise((fulfil, reject) => {
    const job = { code, fulfil, reject }
    if (hurrying.delete(code)) waiting.unshift(job)
    else waiting.push(job)
    next()
  })
}

async function loadPicture(code) {
  const saved = await storedPicture(code)
  if (saved) return saved
  const image = await rendered(code)
  if (image) await storePicture(code, image)
  return image
}

function hurry(code) {
  const index = waiting.findIndex(job => job.code === code)
  if (index >= 0) waiting.unshift(waiting.splice(index, 1)[0])
  else hurrying.add(code)
}

export function pictureOf(code, { soon = false } = {}) {
  if (soon && !finished.has(code)) hurrying.add(code)
  else if (soon) hurry(code)
  if (!finished.has(code)) {
    const picture = loadPicture(code)
    finished.set(code, picture)
    picture.catch(() => finished.delete(code))
  }
  return finished.get(code)
}
