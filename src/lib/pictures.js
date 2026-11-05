import { decodeTitle } from "./linkformat.js"
import { savedJars } from "./minecraft.js"

const DATABASE = "minecraft-title-pictures"
const PICTURES_KEPT = 500
const FRAME_WIDTH = 1000
const FRAME_HEIGHT = 500

const finished = new Map()
const waiting = []
let frame = null
let running = null
let nextId = 0
let opened = null
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

function openFrame() {
  opened ??= new Promise((fulfil, reject) => {
    frame = document.createElement("iframe")
    frame.src = new URL("app/render.html", document.baseURI).href
    frame.setAttribute("aria-hidden", "true")
    frame.tabIndex = -1
    Object.assign(frame.style, { position: "fixed", top: "0", left: "0", width: `${FRAME_WIDTH}px`, height: `${FRAME_HEIGHT}px`, border: "0", opacity: "0", pointerEvents: "none", zIndex: "-1" })
    function ready(event) {
      if (event.origin !== location.origin || event.source !== frame.contentWindow || event.data?.type !== "ready") return
      removeEventListener("message", ready)
      addEventListener("message", answered)
      fulfil()
    }
    addEventListener("message", ready)
    frame.addEventListener("error", () => reject(new Error("the title renderer failed to load")))
    document.body.append(frame)
  })
  return opened
}

function answered(event) {
  if (event.origin !== location.origin || event.source !== frame.contentWindow || event.data?.id !== running?.id) return
  const job = running
  running = null
  if (event.data.type === "rendered") job.fulfil(event.data.image)
  else job.reject(new Error(event.data.error))
  next()
}

async function next() {
  if (running || !waiting.length) return
  running = waiting.shift()
  try {
    await openFrame()
    frame.contentWindow.postMessage({ type: "render", id: running.id, code: running.code }, location.origin)
  } catch (err) {
    const job = running
    running = null
    job.reject(err)
    next()
  }
}

function openDatabase() {
  database ??= new Promise((fulfil, reject) => {
    const opening = indexedDB.open(DATABASE, 1)
    opening.onupgradeneeded = () => opening.result.createObjectStore("pictures", { keyPath: "code" }).createIndex("at", "at")
    opening.onsuccess = () => fulfil(opening.result)
    opening.onerror = () => reject(opening.error)
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
    waiting.push({ id: ++nextId, code, fulfil, reject })
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

export function pictureOf(code) {
  if (!finished.has(code)) {
    const picture = loadPicture(code)
    finished.set(code, picture)
    picture.catch(() => finished.delete(code))
  }
  return finished.get(code)
}
