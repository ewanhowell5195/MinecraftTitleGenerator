import { Canvas, Image, loadImage, ImageData } from "skia-canvas"
import compress_images from "compress-images"
import getTHREE from "node-three"
import createContext from "gl"
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

const fonts = JSON.parse(fs.readFileSync("../fonts.json"))

const ten = fonts.find(e => e.id === "minecraft-ten")
ten.height = 44
ten.border = 266
ten.ends = [[0, 22]]

fonts.forEach(font => {
  if (font.variants) {
    for (const variant of font.variants) {
      const variantFont = Object.assign(Object.fromEntries(Object.entries(font).filter(e => e[0] !== "variants")), variant)
      fonts.push(variantFont)
    }
  }
})

for (const font of fonts) {
  font.characters = {}

  for (const file of fs.readdirSync(`../fonts/${font.id}/characters`)) {
    const char = charMap[file.slice(0, -5)] ?? file.slice(0, -5)
    font.characters[char] = JSON.parse(fs.readFileSync(`../fonts/${font.id}/characters/${file}`, "utf8")).elements
    for (const element of font.characters[char]) {
      for (const [direction, face] of Object.entries(element.faces)) {
        if (face.rotation === 180) face.uv = [face.uv.slice(2), face.uv.slice(0, 2)].flat()
        element.faces[direction] = face.uv
      }
    }
  }

  fs.writeFileSync(`../fonts/${font.id}/characters.json`, JSON.stringify(font.characters))

  console.log(`Done ${font.id} characters`)

  fs.writeFileSync(`../fonts/${font.id}/textures.json`, JSON.stringify(JSON.parse(fs.readFileSync(`../fonts/${font.id}/textures.json`)), null, 2) + "\n")

  fs.mkdirSync(`temp/${font.id}/textures`, { recursive: true })
  fs.mkdirSync(`temp/${font.id}/overlays`, { recursive: true })
  fs.mkdirSync(`temp/${font.id}/thumbnails`, { recursive: true })

  const textures = fs.readdirSync(`../fonts/${font.id}/textures`).map(e => ["textures", e]).concat(fs.readdirSync(`../fonts/${font.id}/overlays`).map(e => ["overlays", e]))

  const flat = await loadImage(`../fonts/${font.id}/textures/flat.png`)
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

    const texture = await loadTexture(file[0] ? `../fonts/${font.id}/${file[0]}/${file[1]}` : file[2])
    if (file[0]) texture.image.saveAs(`temp/${font.id}/${file[0]}/${file[1]}`)

    const scaleFactor = texture.image.width / 1000
    const [scene, camera] = makeTitleScene(scaleFactor)

    if (file[0] === "overlays") {
      const ctx = texture.image.getContext("2d")
      ctx.globalCompositeOperation = "destination-over"
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(overlayBackground, 0, 0, texture.image.width, texture.image.height)
    }

    let text = font.preview ?? "abc"
    if (font.forcedTerminators) {
      if (font.terminatorSpace) text = `┫ ${text} ┣`
      else text = `┫${text}┣`
    }

    await addTitleText(scene, text, {
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

    canvas.saveAs(`temp/${font.id}/thumbnails/${file[1]}`)
    console.log(`Done ${font.id} ${file[1]}`)
  }
}

console.log("Compressing textures...")

compress_images("temp/**/*.png", "../fonts/", {
  statistic: false,
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

async function addTitleText(scene, str, args) {
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
  for (const char of str) {
    if (char === " ") {
      width += 8
      continue
    }
    if (!font.characters[char]) continue
    let min = Infinity
    let max = -Infinity
    const character = new THREE.Group()
    for (let cube of font.characters[char]) {
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

      for (const key of Object.keys(indexes)) {
        const face = cube.faces[key]
        const i = indexes[key]
        if (face) {
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
    for (const cube of character.children) {
      cube.position.x -= width + max
    }
    group.add(character)
    width += max - min
  }

  for (const cube of cubes) {
    cube.position.x += width / 2
  }

  if (args.row) {
    group.position.y += font.height * args.row
  }

  if (args.type === "bottom") {
    group.scale.setX(0.75)
    group.scale.setY(1.6)
    group.scale.setZ(0.75)
    group.rotation.fromArray([torad(-90), 0, 0])
    group.position.z += font.height + 49
    group.position.y -= 25 - font.depth
  } else if (args.type === "small") {
    group.scale.setX(0.35)
    group.scale.setY(0.35)
    group.scale.setZ(0.35)
    group.position.y -= font.height * 0.35
  }

  if (args.scale) {
    group.scale.setX(group.scale.x * args.scale[0])
    group.scale.setY(group.scale.y * args.scale[1])
    group.scale.setZ(group.scale.z * args.scale[2])
  }

  if (args.rotation) {
    const old = group.rotation.toArray()
    group.rotation.fromArray(args.rotation.map((e, i) => torad(e) + old[i]))
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