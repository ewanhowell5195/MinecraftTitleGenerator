import { platform, usePlatform } from "./platform.js"

const files = new Map()
let installed = false

function install() {
  if (installed) return
  installed = true
  const { fetch: fetchFile, loadImage } = platform
  usePlatform({
    fetch: (url, ...rest) => files.has(url) ? Promise.resolve(new Response(JSON.stringify(files.get(url)), { headers: { "content-type": "application/json" } })) : fetchFile(url, ...rest),
    loadImage: src => loadImage(files.get(src) ?? src)
  })
}

export function serveFile(url, value) {
  install()
  files.set(url, value)
}

export function forgetFiles(folder) {
  for (const url of files.keys()) if (url.startsWith(`${folder}/`)) files.delete(url)
}

export function pngUrl({ data, width, height }) {
  const canvas = document.createElement("canvas")
  canvas.width = Math.max(1, width)
  canvas.height = Math.max(1, height)
  if (width && height) canvas.getContext("2d").putImageData(new ImageData(data, width, height), 0, 0)
  return canvas.toDataURL("image/png")
}
