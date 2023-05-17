import { Canvas, loadImage } from "skia-canvas"
import fs from "node:fs"

for (const file of fs.readdirSync("textures")) {
  const img = await loadImage(`textures/${file}`)
  const canvas = new Canvas(img.width, img.height)
  canvas.getContext("2d").drawImage(img, 0, 0)
  canvas.saveAs(`textures/${file}`)
  console.log(`Done ${file}`)
}