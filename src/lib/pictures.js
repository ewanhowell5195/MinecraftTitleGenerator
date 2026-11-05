import { decodeTitle } from "./linkformat.js"
import { savedJars } from "./minecraft.js"

const DATABASE = "minecraft-title-pictures"
const RENDERER_VERSION = 4
const PICTURES_KEPT = 500
const FRAME_WIDTH = 1000
const FRAME_HEIGHT = 500
// same-origin frames share the page's main thread, so measured 3 frames were slower than 1
const MOST_RENDERERS = 1
const RENDERER_IDLE_TIME = 5000

const finished = new Map()
const waiting = []
const renderers = new Set()
const hurrying = new Set()
let nextId = 0
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

function startRenderer() {
  const frame = document.createElement("iframe")
  const renderer = { frame, job: null, closing: null }
  frame.src = new URL("app/render.html", document.baseURI).href
  frame.setAttribute("aria-hidden", "true")
  frame.tabIndex = -1
  Object.assign(frame.style, { position: "fixed", top: "0", left: "0", width: `${FRAME_WIDTH}px`, height: `${FRAME_HEIGHT}px`, border: "0", opacity: "0", pointerEvents: "none", zIndex: "-1" })
  renderer.opened = new Promise((fulfil, reject) => {
    renderer.listener = event => {
      if (event.origin !== location.origin || event.source !== frame.contentWindow) return
      if (event.data?.type === "ready") fulfil()
      else if (event.data?.id === renderer.job?.id) finishJob(renderer, event.data)
    }
    addEventListener("message", renderer.listener)
    frame.addEventListener("error", () => reject(new Error("the title renderer failed to load")))
  })
  document.body.append(frame)
  renderers.add(renderer)
  return renderer
}

function closeRenderer(renderer) {
  clearTimeout(renderer.closing)
  removeEventListener("message", renderer.listener)
  renderer.frame.remove()
  renderers.delete(renderer)
}

function finishJob(renderer, answer) {
  const { job } = renderer
  renderer.job = null
  if (answer.type === "rendered") job.fulfil(answer.image)
  else job.reject(new Error(answer.error))
  next()
}

async function runJob(renderer, job) {
  try {
    await renderer.opened
    renderer.frame.contentWindow.postMessage({ type: "render", id: job.id, code: job.code }, location.origin)
  } catch (err) {
    renderer.job = null
    closeRenderer(renderer)
    job.reject(err)
    next()
  }
}

function freeRenderer() {
  const free = Array.from(renderers).find(renderer => !renderer.job)
  if (free) return free
  return renderers.size < MOST_RENDERERS ? startRenderer() : null
}

function next() {
  while (waiting.length) {
    const renderer = freeRenderer()
    if (!renderer) break
    clearTimeout(renderer.closing)
    renderer.job = waiting.shift()
    runJob(renderer, renderer.job)
  }
  for (const renderer of renderers) {
    if (renderer.job) continue
    clearTimeout(renderer.closing)
    renderer.closing = setTimeout(() => closeRenderer(renderer), RENDERER_IDLE_TIME)
  }
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
    const job = { id: ++nextId, code, fulfil, reject }
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
