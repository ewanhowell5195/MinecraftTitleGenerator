import { runBake } from "./coverRaster.js"

const KEPT_SOURCES = 4
const sources = new Map()

self.onmessage = ({ data }) => {
  const { id, source, pixels, width, height, job } = data
  if (pixels) {
    sources.delete(source)
    sources.set(source, { pixels, width, height })
    if (sources.size > KEPT_SOURCES) sources.delete(sources.keys().next().value)
  }
  const kept = sources.get(source)
  if (!kept) {
    self.postMessage({ id, missing: true })
    return
  }
  try {
    const results = runBake(job, kept.pixels)
    self.postMessage({ id, results }, results.filter(Boolean).map(words => words.buffer))
  } catch (err) {
    self.postMessage({ id, error: err.message })
  }
}
