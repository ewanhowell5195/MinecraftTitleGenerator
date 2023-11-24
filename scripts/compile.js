import { Canvas, loadImage, ImageData } from "skia-canvas"
import compress_images from "compress-images"
import fs from "node:fs"

// fs.rmSync("temp", { recursive: true, force: true })

const charMap = {
  asterisk: "*",
  backwardslash: "\\",
  colon: ":",
  creeper: "😳",
  end: "┣",
  forwardslash: "/",
  greaterthan: ">",
  lessthan: "<",
  openquote: "😩",
  questionmark: "?",
  space: " ",
  spacer: "​",
  start: "┫"
}

const fonts = JSON.parse(fs.readFileSync("../fonts.json"))

const ten = fonts.find(e => e.id === "minecraft-ten")
ten.height = 44
ten.border = 266
ten.ends = [[0, 22]]

fonts.forEach(font => {
  if (font.variants) {
    for (const variant of font.variants) {
      fonts.push(Object.assign(Object.fromEntries(Object.entries(font).filter(e => e[0] !== "variants")), variant))
    }
  }
})

function outline(canvas, size, colour) {
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
      data2[i] = colour[0]
      data2[i + 1] = colour[1]
      data2[i + 2] = colour[2]
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
        if (face.rotation === 180) face.uv = [face.uv.slice(2), face.uv.slice(0, 2)].flat()
        element.faces[direction] = face.uv
      }
    }
  }

  fs.writeFileSync(`../fonts/${font.id}/characters.json`, JSON.stringify(characters))

  console.log(`Done ${font.id} characters`)

  fs.mkdirSync(`temp/${font.id}/textures`, { recursive: true })
  fs.mkdirSync(`temp/${font.id}/overlays`, { recursive: true })
  fs.mkdirSync(`temp/${font.id}/thumbnails`, { recursive: true })

  let borderSize
  if (font.borderless) {
    borderSize = 0
  } else {
    borderSize = 2
  }
  const width = font.width - borderSize * 2
  const height = font.height - borderSize * 2
  const depth = font.ends[0][1]

  let overlayBackground
  const textures = fs.readdirSync(`../fonts/${font.id}/textures`).map(e => ["textures", e]).concat(fs.readdirSync(`../fonts/${font.id}/overlays`).map(e => ["overlays", e]))
  for (const file of textures) {
    if (!file[1].endsWith(".png") || file[1] === "overlay.png") continue

    const img = await loadImage(`../fonts/${font.id}/${file[0]}/${file[1]}`)
    
    const canvas = new Canvas(img.width, img.height)
    const context = canvas.getContext("2d")
    context.drawImage(img, 0, 0)
    canvas.saveAs(`temp/${font.id}/${file[0]}/${file[1]}`)
    
    const m = canvas.width / 1000

    let thumbnail
    if (font.autoBorder || font.borderless) {
      if (font.forcedTerminators) {
        thumbnail = new Canvas(font.width * 3 * m - borderSize * 4 + font.forcedTerminators[4] * 2, font.height * m)
      } else {
        thumbnail = new Canvas(font.width * 3 * m - borderSize * 4, font.height * m)
      }
    } else {
      if (font.forcedTerminators) {
        thumbnail = new Canvas(font.width * 3 * m + borderSize * 4 + font.forcedTerminators[4] * 2, font.height * m)
      } else {
        thumbnail = new Canvas(font.width * 3 * m, font.height * m)
      }
    }
    const ctx = thumbnail.getContext("2d")
    
    if (font.autoBorder || font.borderless) {
      if (font.forcedTerminators) {
        const terminatorWidth = font.forcedTerminators[4] * m
        ctx.drawImage(canvas, font.forcedTerminators[0] * m, font.forcedTerminators[1] * m, terminatorWidth, font.forcedTerminators[5] * m, borderSize * m, borderSize * m, terminatorWidth, font.forcedTerminators[5] * m)
        ctx.drawImage(canvas, width * m + 2 * m, depth * m, width * m, height * m, borderSize * m + terminatorWidth, borderSize * m, width * m, height * m)
        ctx.drawImage(canvas, width * m * 2 + 2 * 2 * m, depth * m, width * m, height * m, borderSize * m + width * m + terminatorWidth, borderSize * m, width * m, height * m)
        ctx.drawImage(canvas, width * m * 3 + 2 * 3 * m, depth * m, width * m, height * m, borderSize * m + width * m * 2 + terminatorWidth, borderSize * m, width * m, height * m)
        ctx.drawImage(canvas, font.forcedTerminators[2] * m, font.forcedTerminators[3] * m, terminatorWidth, font.forcedTerminators[5] * m, borderSize * m + width * m * 3 + terminatorWidth, borderSize * m, terminatorWidth, font.forcedTerminators[5] * m)
      } else {
        ctx.drawImage(canvas, width * m + 2 * m, depth * m, width * m, height * m, borderSize * m, borderSize * m, width * m, height * m)
        ctx.drawImage(canvas, width * m * 2 + 2 * 2 * m, depth * m, width * m, height * m, borderSize * m + width * m, borderSize * m, width * m, height * m)
        ctx.drawImage(canvas, width * m * 3 + 2 * 3 * m, depth * m, width * m, height * m, borderSize * m + width * m * 2, borderSize * m, width * m, height * m)
      }
    } else {
      if (font.forcedTerminators) {
        const terminatorWidth = font.forcedTerminators[4] * m
        ctx.drawImage(canvas, font.forcedTerminators[0] * m, font.forcedTerminators[1] * m, terminatorWidth, font.forcedTerminators[5] * m, borderSize * m, borderSize * m, terminatorWidth, font.forcedTerminators[5] * m)
        ctx.drawImage(canvas, width * m + 2 * m, depth * m, width * m, height * m, borderSize * m * 3 + terminatorWidth, borderSize * m, width * m, height * m)
        ctx.drawImage(canvas, width * m * 2 + 2 * 2 * m, depth * m, width * m, height * m, borderSize * 5 * m + width * m + terminatorWidth, borderSize * m, width * m, height * m)
        ctx.drawImage(canvas, width * m * 3 + 2 * 3 * m, depth * m, width * m, height * m, borderSize * 7 * m + width * m * 2 + terminatorWidth, borderSize * m, width * m, height * m)
        ctx.drawImage(canvas, font.forcedTerminators[2] * m, font.forcedTerminators[3] * m, terminatorWidth, font.forcedTerminators[5] * m, borderSize * 9 * m + width * m * 3 + terminatorWidth, borderSize * m, terminatorWidth, font.forcedTerminators[5] * m)
      } else {
        ctx.drawImage(canvas, width * m + 2 * m, depth * m, width * m, height * m, borderSize * m, borderSize * m, width * m, height * m)
        ctx.drawImage(canvas, width * m * 2 + 2 * 2 * m, depth * m, width * m, height * m, borderSize * 3 * m + width * m, borderSize * m, width * m, height * m)
        ctx.drawImage(canvas, width * m * 3 + 2 * 3 * m, depth * m, width * m, height * m, borderSize * 5 * m + width * m * 2, borderSize * m, width * m, height * m)
      }
    }

    if (file[0] === "textures") {
      if (!font.borderless) outline(thumbnail, 2 * m, context.getImageData(0, font.border * m, 1, 1).data)
    } else {
      ctx.globalCompositeOperation = "destination-over"
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(overlayBackground, 0, 0, thumbnail.width, thumbnail.height)
    }

    thumbnail.saveAs(`temp/${font.id}/thumbnails/${file[1]}`)

    if (file[1] === "flat.png") {
      overlayBackground = new Canvas(thumbnail.width, thumbnail.height)
      const overlayBackgroundCtx = overlayBackground.getContext("2d")
      overlayBackgroundCtx.drawImage(thumbnail, 0, 0)
      overlayBackgroundCtx.fillStyle = "rgb(0,0,0,0.25)"
      overlayBackgroundCtx.globalCompositeOperation = "destination-in"
      overlayBackgroundCtx.fillRect(0, 0, thumbnail.width, thumbnail.height)
      overlayBackgroundCtx.globalCompositeOperation = "source-over"
      overlayBackground.saveAs(`temp/${font.id}/thumbnails/none.png`)
    }
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
  if (fs.existsSync(stat.path_out_new + ".bak")) fs.unlinkSync(stat.path_out_new + ".bak")
})