import * as THREE from "three"

export const platform = {
  minecraftAsset: null,
  minecraftModels: null,
  fetch: (...args) => fetch(...args),
  createCanvas: () => document.createElement("canvas"),
  createWebGLRenderer: () => new THREE.WebGLRenderer({ antialias: false, alpha: true }),
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
