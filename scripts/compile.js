import { Canvas, loadImage, ImageData } from "skia-canvas"
import compress_images from "compress-images"
import fs from "node:fs"

const charMap = {
  asterisk: "*",
  backwardslash: "\\",
  colon: ":",
  creeper: "😳",
  forwardslash: "/",
  greaterthan: ">",
  lessthan: "<",
  openquote: "😩",
  questionmark: "?"
}

const fonts = JSON.parse(fs.readFileSync("../fonts.json"))

fonts.push({
  id: "minecraft-ten",
  width: 32,
  height: 44,
  border: 266,
  ends: [[0, 22]]
})

function outline(canvas, size) {
  const ctx = canvas.getContext("2d")
  const width = canvas.width
  const height = canvas.height
  const data = ctx.getImageData(0, 0, width, height).data
  const data2 = data.slice()
  const length = data.length

  for (let i = 0; i < length; i += 4) {
    let a = data[i + 3]
    if (a !== 255) {
      const x = i / 4 % width
      const y = Math.floor(i / 4 / width)
      const cx =  Math.min(width - 1, x + size) - x
      const cy = Math.min(height - 1, y + size) - y
      loop:
      for (let sy = Math.max(0, y - size) - y; sy <= cy; sy++) {
        for (let sx = Math.max(0, x - size) - x; sx <= cx; sx++) {
          a = Math.max(a, data[i + (sx + sy * width) * 4 + 3])
          if (a === 255) break loop
        }
      }
      if (!a) continue
      data2[i] = 0
      data2[i + 1] = 0
      data2[i + 2] = 0
      data2[i + 3] = 255
    }
  }
  ctx.putImageData(new ImageData(data2, width, height), 0, 0)
}

for (const font of fonts) {
  const characters = {}

  for (const file of fs.readdirSync(`../fonts/${font.id}/characters`)) {
    const char = charMap[file.slice(0, -5)] ?? file.slice(0, -5)
    characters[char] = JSON.parse(fs.readFileSync(`../fonts/${font.id}/characters/${file}`, "utf8")).elements
    for (const element of characters[char]) {
      for (const [direction, face] of Object.entries(element.faces)) {
        element.faces[direction] = face.uv
      }
    }
  }

  fs.writeFileSync(`../fonts/${font.id}/characters.json`, JSON.stringify(characters))

  console.log(`Done ${font.id} characters`)

  fs.mkdirSync(`temp/${font.id}/textures`, { recursive: true })
  fs.mkdirSync(`temp/${font.id}/thumbnails`, { recursive: true })

  const width = font.width - 4
  const height = font.height - 4
  const depth = font.ends[0][1]

  for (const file of fs.readdirSync(`../fonts/${font.id}/textures`)) {
    const img = await loadImage(`../fonts/${font.id}/textures/${file}`)
    
    const canvas = new Canvas(img.width, img.height)
    const context = canvas.getContext("2d")
    context.drawImage(img, 0, 0)
    canvas.saveAs(`temp/${font.id}/textures/${file}`)
    
    const m = canvas.width / 1000

    const thumbnail = new Canvas(font.width * 3 * m, font.height * m)
    const ctx = thumbnail.getContext("2d")
    ctx.drawImage(canvas, width * m + 2 * m, depth * m, width * m, height * m, 2 * m, 2 * m, width * m, height * m)
    ctx.drawImage(canvas, width * m * 2 + 4 * m, depth * m, width * m, height * m, 6 * m + width * m, 2 * m, width * m, height * m)
    ctx.drawImage(canvas, width * m * 3 + 6 * m, depth * m, width * m, height * m, 10 * m + width * m * 2, 2 * m, width * m, height * m)
    
    outline(thumbnail, 2 * m)

    thumbnail.saveAs(`temp/${font.id}/thumbnails/${file}`)
  }
}

console.log("Compressing textures...")

compress_images("temp/**/*.png", "../fonts/", {
  statistic: true,
  autoupdate: true,
  compress_force: true,
}, false,
  { jpg: { engine: false, command: false } },
  { png: { engine: "optipng", command: ["-backup"] } },
  { svg: { engine: false, command: false } },
  { gif: { engine: false, command: false } },
(err, comp, stat) => {
  console.log(stat)
  if (fs.existsSync(stat.path_out_new + ".bak")) fs.unlinkSync(stat.path_out_new + ".bak")
})