import * as THREE from "three"

let textureSize = null

function maxTextureSize() {
  if (textureSize === null) {
    const gl = document.createElement("canvas").getContext("webgl2")
    textureSize = gl ? gl.getParameter(gl.MAX_TEXTURE_SIZE) : 0
    gl?.getExtension("WEBGL_lose_context")?.loseContext()
  }
  return textureSize
}

export const platform = {
  minecraftAsset: null,
  minecraftModels: null,
  fetch: (...args) => fetch(...args),
  createCanvas: () => document.createElement("canvas"),
  createWebGLRenderer: () => new THREE.WebGLRenderer({ antialias: false, alpha: true }),
  maxTextureSize,
  decodePng: bytes => createImageBitmap(new Blob([bytes], { type: "image/png" })),
  pngUrl: bytes => URL.createObjectURL(new Blob([bytes], { type: "image/png" })),
  frame: callback => requestAnimationFrame(callback),
  cancelFrame: id => cancelAnimationFrame(id),
  loadImage(src) {
    return new Promise((fulfil, reject) => {
      const image = new Image()
      image.onload = () => fulfil(image)
      image.onerror = () => reject(new Error(`failed to load ${src}`))
      image.src = src
    })
  }
}

export function usePlatform(overrides) {
  Object.assign(platform, overrides)
}

export function painted() {
  return new Promise(fulfil => platform.frame(() => platform.frame(fulfil)))
}
