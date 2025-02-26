import { Canvas, Image, loadImage, ImageData } from "skia-canvas"
import compressed from "./compressed.json" with { type: "json" }
import { execFile } from "node:child_process"
import { createHash } from "node:crypto"
import getTHREE from "node-three"
import optipng from "optipng-bin"
import createContext from "gl"
import path from "node:path"
import sharp from "sharp"
import fs from "node:fs"

const { THREE, loadTexture } = await getTHREE({ Canvas, Image, ImageData, fetch, Request, Response, Headers })

const w = 160
const h = 96

fs.rmSync("temp", { recursive: true, force: true })

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

console.log("Processing...")

const fonts = JSON.parse(fs.readFileSync("../fonts.json"))
const shapes = JSON.parse(fs.readFileSync("../shapes.json"))

const ten = fonts.find(e => e.id === "minecraft-ten")

const tenShape = shapes.find(e => e.id === "minecraft-ten-blank")
tenShape.textureWidth = 28

for (const font of fonts) {
  font.type = "font"
  font.textureWidth = 1000
  if (font.variants) {
    for (const v of font.variants) {
      const variant = Object.assign({}, font, v)
      delete variant.variants
      if (variant.shifts) {
        if (v.shifts === "inherit") {
          variant.shifts = font.shifts
        } else if (!v.shifts) {
          delete variant.shifts
        }
      }
      fonts.push(variant)
    }
  }
}

for (const shape of shapes) {
  shape.type = "shape"
  fonts.push(shape)
}

const shapeModels = {}

for (const font of fonts) {
  font.characters = {}

  if (font.type === "font") {
    for (const file of fs.readdirSync(`../fonts/${font.id}/characters`)) {
      const char = charMap[file.slice(0, -5)] ?? file.slice(0, -5)
      font.characters[char] = JSON.parse(fs.readFileSync(`../fonts/${font.id}/characters/${file}`, "utf8")).elements
    }
  } else if (font.type === "shape") {
    font.characters.a = JSON.parse(fs.readFileSync(`../shapes/${font.id}/model.json`, "utf8")).elements
  }

  for (const char of Object.values(font.characters)) {
    for (const element of char) {
      for (const [direction, face] of Object.entries(element.faces)) {
        if (face.rotation === 180) face.uv = [face.uv.slice(2), face.uv.slice(0, 2)].flat()
        element.faces[direction] = face.uv
      }
    }
  }

  if (font.type === "font") {
    fs.writeFileSync(`../fonts/${font.id}/characters.json`, JSON.stringify(font.characters))
    console.log(`Done ${font.id} characters`)
  } else if (font.type === "shape") {
    shapeModels[font.id] = font.characters.a
    console.log(`Done ${font.id} model`)
  }

  fs.writeFileSync(`../${font.type}s/${font.id}/textures.json`, JSON.stringify(JSON.parse(fs.readFileSync(`../${font.type}s/${font.id}/textures.json`)), null, 2) + "\n")

  fs.mkdirSync(`../${font.type}s/${font.id}/thumbnails`, { recursive: true })
  fs.mkdirSync(`temp/${font.type}s/${font.id}/thumbnails`, { recursive: true })

  const textures = fs.readdirSync(`../${font.type}s/${font.id}/textures`).map(e => ["textures", e]).concat(fs.readdirSync(`../${font.type}s/${font.id}/overlays`).map(e => ["overlays", e]))

  const flat = await loadImage(`../${font.type}s/${font.id}/textures/flat.png`)
  const overlayBackground = new Canvas(flat.width, flat.height)
  const overlayBackgroundCtx = overlayBackground.getContext("2d")
  overlayBackgroundCtx.drawImage(flat, 0, 0)
  overlayBackgroundCtx.fillStyle = "rgb(0,0,0,0.3)"
  overlayBackgroundCtx.globalCompositeOperation = "destination-in"
  overlayBackgroundCtx.fillRect(0, 0, flat.width, flat.height)
  overlayBackgroundCtx.globalCompositeOperation = "source-over"
  textures.push([null, "none.png", overlayBackground])

  for (const file of textures) {
    if (!file[1].endsWith(".png") || file[1] === "overlay.png") continue

    const texture = await loadTexture(file[0] ? `../${font.type}s/${font.id}/${file[0]}/${file[1]}` : file[2])

    const scaleFactor = texture.image.width / font.textureWidth
    const [scene, camera] = makeTitleScene(scaleFactor)

    if (file[0] === "overlays") {
      const ctx = texture.image.getContext("2d")
      ctx.globalCompositeOperation = "destination-over"
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(overlayBackground, 0, 0, texture.image.width, texture.image.height)
    }

    let text
    if (font.type === "font") {
      text = font.preview ?? "abc"
      if (font.forcedTerminators) {
        if (font.terminatorSpace) text = `┫ ${text} ┣`
        else text = `┫${text}┣`
      }
    } else if (font.type === "shape") {
      text = "a"
    }

    addTitleText(scene, text, {
      font: font.id,
      texture
    })

    let canvas = await renderTitleScene(scene, camera, scaleFactor)

    if (font.autoBorder) {
      let colour = [0, 0, 0]
      if (file[0] === "textures") {
        const ctx = texture.image.getContext("2d")
        colour = ctx.getImageData(0, font.border * scaleFactor, 1, 1).data
      }
      const bordered = new Canvas(canvas.width + 4 * scaleFactor, canvas.height + 4 * scaleFactor)
      const ctx = bordered.getContext("2d")
      ctx.drawImage(canvas, 2 * scaleFactor, 2 * scaleFactor)
      const { data } = ctx.getImageData(0, 0, bordered.width, bordered.height)
      const opacity = file[0] === "textures" ? 255 : 77
      for (let i = data.length - 4; i >= 0; i -= 4) {
        if (data[i + 3] === 0) {
          data[i] = colour[0]
          data[i + 1] = colour[1]
          data[i + 2] = colour[2]
          data[i + 3] = opacity
        }
      }
      ctx.putImageData(new ImageData(data, bordered.width, bordered.height), 0, 0)
      canvas = bordered
    }

    const hash = hashCanvas(canvas)
    const texturePath = `${font.type}s/${font.id}/thumbnails/${file[1]}`
    if (compressed[texturePath] === hash) {
      console.log(`Done ${font.id} ${file[1]}`)
      continue
    }

    compressed[texturePath] = hash

    await canvas.saveAs("temp/" + texturePath)
    console.log(`Done ${font.id} ${file[1]}`)
  }
}

fs.writeFileSync("../shapes/shapes.json", JSON.stringify(shapeModels))

console.log("Processed")
console.log("Compressing textures...")

async function* getFiles(dir) {
  const dirents = await fs.promises.readdir(dir, { withFileTypes: true })
  for (const dirent of dirents) {
    const res = path.resolve(dir, dirent.name)
    if (dirent.isDirectory()) {
      yield* getFiles(res)
    } else {
      yield res
    }
  }
}

const toCompress = new Map

for await (let file of getFiles("temp")) {
  file = path.relative("./temp", file)
  toCompress.set(path.join("../", file), path.join("temp", file))
}

const main = []

for await (let file of getFiles("../fonts")) {
  if (!file.endsWith(".png")) continue
  main.push(path.relative("../", file))
}

for await (let file of getFiles("../tileables")) {
  if (!file.endsWith(".png")) continue
  main.push(path.relative("../", file))
}

for await (let file of getFiles("../shapes")) {
  if (!file.endsWith(".png")) continue
  main.push(path.relative("../", file))
}

for (const file of main) {
  const filePath = path.join("../", file)
  if (toCompress.get(filePath)) continue
  const { data } = await sharp(path.join("..", file)).raw().ensureAlpha().toBuffer({ resolveWithObject: true })
  const hash = createHash("sha256").update(data).digest("hex")
  if (compressed[file.replaceAll("\\", "/")] === hash) continue
  compressed[file.replaceAll("\\", "/")] = hash
  toCompress.set(filePath, filePath)
}

for (const [to, from] of toCompress) {
  execFile(optipng, ["-o7", "-backup", "-strip", "all", "-out", to, from], err => {
    if (err) console.error(err)
    if (fs.existsSync(to + ".bak")) fs.unlinkSync(to + ".bak")
  })
}

fs.writeFileSync("compressed.json", JSON.stringify(compressed, null, 2))

function hashCanvas(canvas) {
  const ctx = canvas.getContext("2d")
  let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height).data
  return createHash("sha256").update(Buffer.from(imageData)).digest("hex")
}

function makeTitleScene(scaleFactor) {
  const scene = new THREE.Scene()
  const camera = new THREE.OrthographicCamera(
    -w / 2,
    w / 2,
    h / 2,
    -h / 2,
    1,
    1000
  )
  camera.position.x = 0
  camera.position.y = 22
  camera.position.z = -320
  camera.lookAt(new THREE.Vector3(0, 22, 0))
  camera.up.set(0, 1, 0)
  return [scene, camera]
}

function addModel(scene, model, group, material, cubes, i, font, width, args) {
  let min = Infinity
  let max = -Infinity
  const character = new THREE.Group()
  for (let cube of model) {
    if (!cube.parsed) {
      cube.parsed = true
      for (const [direction, uv] of Object.entries(cube.faces)) {
        cube.faces[direction] = { uv }
      }
    }

    cube = JSON.parse(JSON.stringify(cube))
    min = Math.min(min, cube.from[0], cube.to[0])
    max = Math.max(max, cube.from[0], cube.to[0])

    if (args.type === "bottom") {
      if (cube.to[2] > cube.from[2]) {
        cube.to[2] += 20
      } else {
        cube.from[2] += 20
      }
    }

    const geometry = new THREE.BoxGeometry(cube.to[0] - cube.from[0], cube.to[1] - cube.from[1], cube.to[2] - cube.from[2])
    const mesh = new THREE.Mesh(geometry, material)

    mesh.position.fromArray([
      (cube.from[0] + cube.to[0]) / 2,
      (cube.from[1] + cube.to[1]) / 2,
      (cube.from[2] + cube.to[2]) / 2
    ])

    const indexes = {
      north: 40,
      east: 0,
      south: 32,
      west: 8,
      up: 16,
      down: 24
    }

    const fontTextureWidth = fonts.find(e => e.id === args.font).textureWidth

    for (const key of Object.keys(indexes)) {
      const face = cube.faces[key]
      const i = indexes[key]
      if (face) {
        if (cube.to[0] < cube.from[0] ^ face.uv[0] < face.uv[2]) {
          const diff = face.uv[2] - face.uv[0]
          const width = Math.round(diff / 16 * fontTextureWidth) % 2
          if (width === 1) {
            face.uv[0] += 1 / fontTextureWidth * 16
            face.uv[2] += 1 / fontTextureWidth * 16
          }
        }
        const uv = [
          [face.uv[0] / 16, 1 - (face.uv[1] / 16)],
          [face.uv[2] / 16, 1 - (face.uv[1] / 16)],
          [face.uv[0] / 16, 1 - (face.uv[3] / 16)],
          [face.uv[2] / 16, 1 - (face.uv[3] / 16)]
        ]
        mesh.geometry.attributes.uv.array.set(uv[0], i + 0)
        mesh.geometry.attributes.uv.array.set(uv[1], i + 2)
        mesh.geometry.attributes.uv.array.set(uv[2], i + 4)
        mesh.geometry.attributes.uv.array.set(uv[3], i + 6)
      } else {
        mesh.geometry.attributes.uv.array.set([1, 1], i + 0)
        mesh.geometry.attributes.uv.array.set([1, 1], i + 2)
        mesh.geometry.attributes.uv.array.set([1, 1], i + 4)
        mesh.geometry.attributes.uv.array.set([1, 1], i + 6)
      }
    }
    character.add(mesh)
    cubes.push(mesh)
  }
  if (i) max += font.characterSpacing ?? 0
  for (const cube of character.children) {
    cube.position.x -= width + max
  }
  group.add(character)
  return max - min
}

function addTitleText(scene, str, args) {
  const font = fonts.find(e => e.id === args.font)

  args.texture.colorSpace = THREE.SRGBColorSpace
  args.texture.magFilter = THREE.NearestFilter
  args.texture.minFilter = THREE.NearestFilter
  args.texture.flipY = true

  const material = new THREE.MeshBasicMaterial({
    map: args.texture,
    transparent: true,
    alphaTest: 0.01
  })

  let width = 0
  const cubes = []
  const group = new THREE.Group()
  let lastCharacter
  for (const [i, char] of Array.from(str).entries()) {
    if (char === " " && !font.characters[" "]) {
      width += 8
      continue
    }
    if (lastCharacter && font.shifts?.[lastCharacter + char]) {
      width -= font.shifts[lastCharacter + char]
    }
    const model = font.characters[char]
    width += addModel(scene, model, group, material, cubes, i, font, width, args)
    lastCharacter = char
  }

  for (const cube of cubes) {
    cube.position.x += width / 2
  }

  scene.add(group)
}

async function renderTitleScene(scene, camera, scaleFactor) {
  const gl = createContext(w * scaleFactor, h * scaleFactor)
  const renderer = new THREE.WebGLRenderer({
    context: gl
  })
  renderer.render(scene, camera, new THREE.WebGLRenderTarget(w * scaleFactor, h * scaleFactor))
  const buff = Buffer.alloc(w * scaleFactor * h * scaleFactor * 4)
  gl.readPixels(0, 0, w * scaleFactor, h * scaleFactor, gl.RGBA, gl.UNSIGNED_BYTE, buff)
  const img = await loadImage(await sharp(buff, {
    raw: {
      width: w * scaleFactor,
      height: h * scaleFactor,
      channels: 4
    }
  }).flip().png().toBuffer())
  const canvas = new Canvas(img.width, img.height)
  canvas.getContext("2d").drawImage(img, 0, 0)
  return trim(canvas)
}

function rowBlank(imageData, width, y) {
  for (let x = 0; x < width; ++x) if (imageData.data[y * width * 4 + x * 4 + 3] !== 0) return false
  return true
}

function columnBlank(imageData, width, x, top, bottom) {
  for (let y = top; y < bottom; ++y) if (imageData.data[y * width * 4 + x * 4 + 3] !== 0) return false
  return true
}

function trim(canvas) {
  const ctx = canvas.getContext("2d")
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  let top = 0, bottom = imageData.height, left = 0, right = imageData.width
  while (top < bottom && rowBlank(imageData, canvas.width, top)) ++top
  while (bottom - 1 > top && rowBlank(imageData, canvas.width, bottom - 1)) --bottom
  while (left < right && columnBlank(imageData, canvas.width, left, top, bottom)) ++left
  while (right - 1 > left && columnBlank(imageData, canvas.width, right - 1, top, bottom)) --right
  if (left === right && top === bottom) return canvas
  const trimmed = ctx.getImageData(left, top, right - left, bottom - top);
  const copy = new Canvas(canvas.width, canvas.height)
  const copyCtx = copy.getContext("2d")
  copy.width = trimmed.width
  copy.height = trimmed.height
  copyCtx.putImageData(trimmed, 0, 0)
  return copy
}