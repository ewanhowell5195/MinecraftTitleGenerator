import { computed, onBeforeUnmount, shallowRef, watch } from "vue"
import { image, modelOf, modelTextures } from "../lib/assets.js"
import { rowBottom } from "../lib/build.js"
import { surface } from "../lib/canvas.js"
import { framing } from "../lib/framing.js"
import { quietly } from "../lib/history.js"
import { adjusted, borderOf, colourOverlay } from "../lib/paint.js"
import { placementOf } from "../lib/placement.js"
import { editorTitle, keepTexture, loadedFont } from "../lib/scene.js"
import { activeOverlays, defaultTexture, effectiveScale, setTexture, textureEntry } from "../lib/settings.js"
import { minecraftQuads } from "../lib/minecraftModels.js"
import { MINECRAFT_SCALE, MODEL_BASELINE as BASELINE, SHAPE_TEXTURE, isMinecraftShape, minecraftShapeParts, modelHeight, shapeName, shapeOf } from "../lib/shapes.js"

const BLOCK_TURN = 180
const MINECRAFT_BORDER = "#000000"
const CUSTOM_SHAPE = "custom"
const MINECRAFT_LIST = { textures: {}, overlays: {}, edgeOverlays: {} }
const SHADE = { north: 1, south: 1, up: 1, down: 0.6, east: 0.75, west: 0.75 }

function corners(side, [x1, y1, z1], [x2, y2, z2]) {
  if (side === "north") return [[x2, y2, z1], [x1, y2, z1], [x1, y1, z1], [x2, y1, z1]]
  if (side === "south") return [[x1, y2, z2], [x2, y2, z2], [x2, y1, z2], [x1, y1, z2]]
  if (side === "east") return [[x2, y2, z2], [x2, y2, z1], [x2, y1, z1], [x2, y1, z2]]
  if (side === "west") return [[x1, y2, z1], [x1, y2, z2], [x1, y1, z2], [x1, y1, z1]]
  if (side === "up") return [[x1, y2, z1], [x2, y2, z1], [x2, y2, z2], [x1, y2, z2]]
  return [[x1, y1, z2], [x2, y1, z2], [x2, y1, z1], [x1, y1, z1]]
}

function multiplied(a, b) {
  return a.map(row => [0, 1, 2].map(column => row.reduce((sum, value, index) => sum + value * b[index][column], 0)))
}

function rotationMatrix({ x = 0, y = 0, z = 0, rescale = false }) {
  const [cx, sx, cy, sy, cz, sz] = [x, y, z].flatMap(angle => [Math.cos(angle * Math.PI / 180), Math.sin(angle * Math.PI / 180)])
  const matrix = multiplied([[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]], multiplied([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]], [[1, 0, 0], [0, cx, -sx], [0, sx, cx]]))
  if (!rescale) return matrix
  const scale = [0, 1, 2].map(column => 1 / Math.max(...matrix.map(row => Math.abs(row[column]))))
  return matrix.map(row => row.map((value, column) => value * scale[column]))
}

function rotated(point, rotation) {
  if (!rotation) return point
  const matrix = rotationMatrix(rotation)
  const offset = point.map((value, axis) => value - rotation.origin[axis])
  return matrix.map((row, axis) => row.reduce((sum, value, index) => sum + value * offset[index], 0) + rotation.origin[axis])
}

function turned(texels, rotation = 0) {
  const steps = rotation / 90
  return texels.map((texel, index) => texels[(index + 4 - steps) % 4])
}

function quadsOf(model, { width, height }) {
  return model.elements.flatMap(element => Object.entries(element.faces).map(([side, face]) => {
    const [u1, v1, u2, v2] = face.uv.map((value, index) => Math.round(value * (index % 2 ? height : width) / 16))
    return { points: corners(side, element.from, element.to).map(point => rotated(point, element.rotation)).map(([x, y, z]) => [-x, y, -z]), texels: turned([[u1, v1], [u2, v1], [u2, v2], [u1, v2]], face.rotation), source: "base", tint: null }
  }))
}

function minecraftPlaced(quads, turn) {
  const minY = Math.min(...quads.flatMap(quad => quad.points.map(point => point[1])))
  const cos = Math.round(Math.cos(turn * Math.PI / 180))
  const sin = Math.round(Math.sin(turn * Math.PI / 180))
  return quads.map(quad => ({ ...quad, points: quad.points.map(([x, y, z]) => [(x * cos + z * sin) * MINECRAFT_SCALE, (y - minY) * MINECRAFT_SCALE + BASELINE, (z * cos - x * sin) * MINECRAFT_SCALE]) }))
}

function normalOf([a, b, , d]) {
  const u = [0, 1, 2].map(axis => b[axis] - a[axis])
  const v = [0, 1, 2].map(axis => d[axis] - a[axis])
  return [u[2] * v[1] - u[1] * v[2], u[0] * v[2] - u[2] * v[0], u[1] * v[0] - u[0] * v[1]]
}

function sideOf(quad) {
  const [x, y, z] = normalOf(quad.points)
  const [ax, ay, az] = [Math.abs(x), Math.abs(y), Math.abs(z)]
  if (ay >= ax && ay >= az) return y > 0 ? "up" : "down"
  return ax > az ? "east" : "north"
}

function placed(faces) {
  const points = faces.flatMap(face => face.points)
  const minX = Math.min(...points.map(point => point[0]))
  const maxX = Math.max(...points.map(point => point[0]))
  const minZ = Math.min(...points.map(point => point[2]))
  const maxZ = Math.max(...points.map(point => point[2]))
  const shift = ([x, y, z]) => [x - (minX + maxX) / 2, y - BASELINE, z - (minZ + maxZ) / 2]
  return { faces: faces.map(face => ({ ...face, points: face.points.map(shift) })), depth: maxZ - minZ }
}

function cellOf(face) {
  const us = face.texels.map(texel => texel[0])
  const vs = face.texels.map(texel => texel[1])
  const x = Math.floor(Math.min(...us) + 0.001)
  const y = Math.floor(Math.min(...vs) + 0.001)
  return { face, x, y, width: Math.max(1, Math.ceil(Math.max(...us) - 0.001) - x), height: Math.max(1, Math.ceil(Math.max(...vs) - 0.001) - y) }
}

function tinted(ctx, y, width, height, tint) {
  if (!tint || tint.every(channel => channel === 1)) return
  const pixels = ctx.getImageData(0, y, width, height)
  for (let at = 0; at < pixels.data.length; at += 4) {
    for (let channel = 0; channel < 3; channel++) pixels.data[at + channel] = Math.round(pixels.data[at + channel] * tint[channel])
  }
  ctx.putImageData(pixels, 0, y)
}

function solidAdjusted(surface, look, width, height) {
  const pixels = surface.ctx.getImageData(0, 0, width, height)
  const alpha = pixels.data.filter((value, index) => index % 4 === 3)
  for (let at = 3; at < pixels.data.length; at += 4) pixels.data[at] = 255
  surface.ctx.putImageData(pixels, 0, 0)
  const out = adjusted(surface.canvas, look, { willReadFrequently: true })
  const result = out.ctx.getImageData(0, 0, width, height)
  for (let at = 3; at < result.data.length; at += 4) result.data[at] = alpha[(at - 3) / 4]
  out.ctx.putImageData(result, 0, 0)
  return out
}

function packed(faces, sources, shade) {
  const cells = faces.map(cellOf)
  const width = Math.max(...cells.map(cell => cell.width))
  const height = cells.reduce((sum, cell) => sum + cell.height, 0) + 1
  const atlas = surface(width, height, { willReadFrequently: true })
  let y = 0
  for (const cell of cells) {
    cell.at = y
    atlas.ctx.drawImage(sources[cell.face.source], cell.x, cell.y, cell.width, cell.height, 0, y, cell.width, cell.height)
    tinted(atlas.ctx, y, cell.width, cell.height, cell.face.tint)
    const factor = shade[sideOf(cell.face)]
    if (factor < 1) {
      atlas.ctx.globalCompositeOperation = "source-atop"
      atlas.ctx.fillStyle = `rgba(0, 0, 0, ${1 - factor})`
      atlas.ctx.fillRect(0, y, cell.width, cell.height)
      atlas.ctx.globalCompositeOperation = "source-over"
    }
    y += cell.height
  }
  return { atlas, cells, width, height, swatchY: y }
}

function bodyOf(cells, width, height) {
  const positions = []
  const uvs = []
  for (const { face, at, x: cellX, y: cellY } of cells) {
    const coords = face.texels.map(([u, v]) => [(u - cellX) / width, 1 - (at + v - cellY) / height])
    for (const index of [0, 3, 2, 0, 2, 1]) {
      positions.push(...face.points[index])
      uvs.push(...coords[index])
    }
  }
  return { positions: new Float32Array(positions), uvs: new Float32Array(uvs), triangles: positions.length / 9, sizes: null }
}

function solidRuns(faces, sources, visit) {
  const pixels = new Map()
  function opaque(key, x, y) {
    const source = sources[key]
    if (!pixels.has(key)) pixels.set(key, source.getContext("2d").getImageData(0, 0, source.width, source.height).data)
    return x >= 0 && y >= 0 && x < source.width && y < source.height && pixels.get(key)[(y * source.width + x) * 4 + 3] >= 128
  }
  for (const face of faces) {
    const [t0, t1, , t3] = face.texels
    const [p0, p1, , p3] = face.points
    const e1 = [t1[0] - t0[0], t1[1] - t0[1]]
    const e3 = [t3[0] - t0[0], t3[1] - t0[1]]
    const det = e1[0] * e3[1] - e1[1] * e3[0]
    if (Math.abs(det) < 1e-9) continue
    function at(u, v) {
      const a = (e3[1] * (u - t0[0]) - e3[0] * (v - t0[1])) / det
      const b = (e1[0] * (v - t0[1]) - e1[1] * (u - t0[0])) / det
      return [0, 1, 2].map(axis => p0[axis] + a * (p1[axis] - p0[axis]) + b * (p3[axis] - p0[axis]))
    }
    const cell = cellOf(face)
    for (let row = 0; row < cell.height; row++) {
      let start = null
      for (let column = 0; column <= cell.width; column++) {
        const solid = column < cell.width && opaque(face.source, cell.x + column, cell.y + row)
        if (solid && start === null) start = column
        if (solid || start === null) continue
        visit(face, [[start, row], [column, row], [column, row + 1], [start, row + 1]].map(([c, r]) => at(cell.x + c, cell.y + r)))
        start = null
      }
    }
  }
}

function footprint(faces, sources) {
  const rects = []
  solidRuns(faces, sources, (face, corners) => {
    const normal = normalOf(face.points)
    if (Math.abs(normal[2]) < 0.01 * Math.hypot(...normal)) return
    rects.push({ from: [Math.min(...corners.map(point => point[0])), Math.min(...corners.map(point => point[1]))], to: [Math.max(...corners.map(point => point[0])), Math.max(...corners.map(point => point[1]))] })
  })
  return rects
}

const BOX_FACES = [[0, 1, 2, 3], [7, 6, 5, 4], [0, 4, 5, 1], [1, 5, 6, 2], [2, 6, 7, 3], [3, 7, 4, 0]]

function unit(vector) {
  const length = Math.hypot(...vector)
  return length ? vector.map(value => value / length) : vector
}

function faceOutline(faces, sources, scale, radius, swatch) {
  const positions = []
  const facing = []
  solidRuns(faces, sources, (face, corners) => {
    const scaled = corners.map(point => point.map((value, axis) => value * scale[axis]))
    const across = unit(scaled[1].map((value, axis) => value - scaled[0][axis]))
    const down = unit(scaled[3].map((value, axis) => value - scaled[0][axis]))
    const normal = unit([across[1] * down[2] - across[2] * down[1], across[2] * down[0] - across[0] * down[2], across[0] * down[1] - across[1] * down[0]])
    const outward = unit(normalOf(face.points.map(point => point.map((value, axis) => value * scale[axis]))).map(value => -value))
    const grown = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, d], index) => scaled[index].map((value, axis) => value + radius * (a * across[axis] + d * down[axis])))
    const box = [-1, 1].flatMap(side => grown.map(point => point.map((value, axis) => value + side * radius * normal[axis])))
    const centre = [0, 1, 2].map(axis => box.reduce((sum, point) => sum + point[axis], 0) / 8)
    facing.push({ normal: outward, point: scaled[0], start: positions.length / 3, count: BOX_FACES.length * 6 })
    for (const indices of BOX_FACES) {
      let quad = indices.map(index => box[index])
      const outward = quad[0].map((value, axis) => value - centre[axis])
      if (normalOf(quad).reduce((sum, value, axis) => sum + value * outward[axis], 0) > 0) quad = [quad[0], quad[3], quad[2], quad[1]]
      for (const index of [0, 3, 2, 0, 2, 1]) positions.push(...quad[index])
    }
  })
  const uvs = new Float32Array(positions.length / 3 * 2)
  for (let i = 0; i < uvs.length; i += 2) uvs.set(swatch, i)
  return { positions: new Float32Array(positions), uvs, triangles: positions.length / 9, scale, rects: [], z: 0, facing }
}

export default {
  props: {
    object: { type: Object, required: true },
    shapes: { type: Array, required: true },
    title: { type: Object, default: () => editorTitle }
  },
  setup(props) {
    const object = props.object
    const { heights, runtime, view } = props.title
    const shape = shallowRef(null)
    const model = shallowRef(null)
    const list = shallowRef(null)
    const built = shallowRef(null)
    const error = shallowRef(null)
    const painted = shallowRef(null)
    let request = 0
    let paintRequest = 0

    const font = computed(() => shape.value && { id: shape.value.id, name: shape.value.name, folder: shape.value.folder ?? null, sheetFolder: shape.value.folder ?? null, model: true, minecraft: !!shape.value.minecraft, height: shape.value.height, capHeight: shape.value.height - 4 })

    const look = computed(() => ({
      shape: shape.value?.id,
      texture: object.texture,
      textureVariant: object.textureVariant,
      overlays: list.value && !shape.value?.minecraft ? activeOverlays(list.value, object, "overlays").map(layer => ({ ...layer })) : [],
      hue: object.hue,
      saturation: object.saturation,
      brightness: object.brightness,
      contrast: object.contrast,
      colour: object.colour,
      blend: object.blend,
      colourOpacity: object.colourOpacity,
      customBorder: object.customBorder,
      borderColour: object.borderColour
    }))

    const scale = computed(() => effectiveScale(object))
    const wordScale = computed(() => [object.wordScaleX, object.wordScaleY, object.wordScaleZ])
    const outlineGrow = computed(() => scale.value.map((value, axis) => (object.scaleOutline ? 1 : value) * (object.wordScaleOutline ? 1 : wordScale.value[axis])))
    const depth = computed(() => painted.value?.depth ?? 0)
    const transform = computed(() => placementOf(object, props.title, { height: font.value?.height ?? 0, capHeight: font.value?.capHeight ?? 0, depth: depth.value, reference: depth.value, scale: scale.value, wordScale: wordScale.value, outlineGrow: outlineGrow.value }))

    function outlineScale() {
      const type = object.type === "bottom" ? transform.value.type : [1, 1, 1]
      return type.map((value, axis) => value * outlineGrow.value[axis])
    }

    function modelOutline(scale, extra = 0) {
      const value = built.value
      return faceOutline(value.faces, value.sources, scale, value.border + extra, value.swatch)
    }

    const outline = computed(() => built.value && modelOutline(outlineScale()))
    const halo = computed(() => {
      if (!built.value || !view.render || !framing.outline) return null
      const size = outlineScale()
      const { type } = transform.value
      const total = scale.value.map((value, axis) => value * wordScale.value[axis])
      return modelOutline(size, framing.outlineWidth * size[0] / (type[0] * total[0]))
    })

    async function pickMinecraft(id, token) {
      const { kind, id: name } = minecraftShapeParts(id)
      if (!object.shapeVersion) throw new Error("this Minecraft shape has no game version")
      const data = await minecraftQuads(kind, name, object.shapeVersion)
      if (token !== request) return
      const sources = Object.fromEntries(Object.entries(data.sources).map(([key, picture]) => {
        const copy = surface(picture.width, picture.height, { willReadFrequently: true })
        copy.ctx.drawImage(picture, 0, 0)
        return [key, copy.canvas]
      }))
      const top = Math.max(...minecraftPlaced(data.quads, kind === "block" ? BLOCK_TURN : 0).flatMap(quad => quad.points.map(point => point[1])))
      keepTexture.delete(object)
      loadedFont.set(object, id)
      shape.value = { id, name: shapeName(props.shapes, id), minecraft: true, height: Math.round(top) }
      model.value = { quads: data.quads, sources, turn: kind === "block" ? BLOCK_TURN : 0 }
      list.value = MINECRAFT_LIST
    }

    function pickCustom() {
      const { model: data, texture } = object.customModel
      loadedFont.set(object, CUSTOM_SHAPE)
      shape.value = { id: CUSTOM_SHAPE, name: "Shape", folder: null, height: modelHeight(data), textureUrl: texture }
      model.value = data
      list.value = { textures: { [SHAPE_TEXTURE]: { border: MINECRAFT_BORDER } }, overlays: {}, edgeOverlays: {} }
    }

    async function pick(id) {
      const token = ++request
      if (object.customModel) return pickCustom()
      if (isMinecraftShape(id)) return pickMinecraft(id, token)
      const entry = shapeOf(props.shapes, id)
      const [data, textures] = await Promise.all([modelOf(entry.folder), modelTextures(entry.folder)])
      if (token !== request) return
      if (!keepTexture.has(object) && loadedFont.get(object) !== entry.id) {
        quietly(() => {
          setTexture(object, { textureSource: "premade", texture: defaultTexture(textures, object.type), textureVariant: null })
          object.overlays = object.overlays.filter(layer => layer.source === "file" || textures.overlays[layer.overlay])
        })
      } else if (object.texture === null || object.textureSource !== "premade") quietly(() => setTexture(object, { textureSource: "premade", texture: object.texture ?? defaultTexture(textures, object.type) }))
      keepTexture.delete(object)
      loadedFont.set(object, entry.id)
      shape.value = entry
      model.value = data
      list.value = textures
    }

    async function textureCanvas(value) {
      const entry = textureEntry(list.value, object)
      const id = entry ? object.textureVariant ?? object.texture : Object.keys(list.value.textures)[0]
      const base = await image(shape.value.textureUrl ?? `${shape.value.folder}/textures/${id}.png`)
      const source = surface(base.width, base.height)
      source.ctx.drawImage(base, 0, 0)
      const work = adjusted(source.canvas, value)
      const layers = await Promise.all(value.overlays.flatMap(layer => {
        if (layer.source === "file") return layer.file ? [image(layer.file).then(file => ({ layer, file }))] : []
        return list.value.overlays[layer.overlay] ? [image(`${shape.value.folder}/overlays/${layer.overlay}.png`).then(file => ({ layer, file }))] : []
      }))
      for (const { layer, file } of layers) {
        const mask = surface(base.width, base.height)
        mask.ctx.drawImage(file, 0, 0, base.width, base.height)
        work.ctx.globalCompositeOperation = layer.blend
        work.ctx.globalAlpha = layer.opacity / 100
        work.ctx.drawImage(colourOverlay(mask, layer).canvas, 0, 0)
        work.ctx.globalAlpha = 1
        work.ctx.globalCompositeOperation = "source-over"
      }
      return { canvas: work.canvas, border: borderOf(value, { border: entry?.border ?? list.value.textures.flat?.border ?? "#000000" }) }
    }

    async function paint() {
      if (!shape.value || !model.value || !list.value) return
      const token = ++paintRequest
      try {
        const value = look.value
        const minecraft = shape.value.minecraft
        const { sources, border } = minecraft ? { sources: model.value.sources, border: borderOf(value, { border: MINECRAFT_BORDER }) } : await textureCanvas(value).then(({ canvas, border }) => ({ sources: { base: canvas }, border }))
        if (token !== paintRequest) return
        const { faces, depth: modelDepth } = placed(minecraft ? minecraftPlaced(model.value.quads, model.value.turn) : quadsOf(model.value, sources.base))
        const packing = packed(faces, sources, SHADE)
        const { cells, width, height, swatchY } = packing
        const atlas = minecraft ? solidAdjusted(packing.atlas, value, width, swatchY) : packing.atlas
        atlas.ctx.fillStyle = `rgba(${border[0]}, ${border[1]}, ${border[2]}, ${border[3] / 255})`
        atlas.ctx.fillRect(0, swatchY, 1, 1)
        const boxes = footprint(faces, sources)
        const points = faces.flatMap(face => face.points)
        const line = { min: [Math.min(...points.map(point => point[0])), Math.min(...points.map(point => point[1])), -modelDepth / 2], max: [Math.max(...points.map(point => point[0])), Math.max(...points.map(point => point[1])), modelDepth / 2] }
        built.value = { body: bodyOf(cells, width, height), texture: atlas.canvas, depth: modelDepth, border: object.border, boxes: boxes.map(box => [box.from, box.to]), bottom: rowBottom([boxes]), line, frame: null, shapes: null, tools: null, twist: null, swatch: [0.5 / width, 1 - (swatchY + 0.5) / height], averages: null, faces, sources }
        painted.value = { shape: shape.value.id, depth: modelDepth }
        error.value = null
      } catch (err) {
        if (token === paintRequest) error.value = err.message
      }
    }

    watch(() => [object.shape, object.shapeVersion, object.customModel], () => pick(object.shape).catch(err => (error.value = err.message)), { immediate: true })
    watch([look, model, list, () => object.border], paint, { immediate: true })
    watch([shape, list, built, error, transform, outline, halo, painted, () => object.shape], () => {
      runtime[object.id] = { font: font.value, list: list.value, built: built.value, error: error.value, transform: transform.value, outline: outline.value, halo: halo.value, preview: built.value && { built: built.value, outline: outline.value }, settled: painted.value?.shape === object.shape || !!error.value }
    }, { immediate: true })

    watch(font, value => {
      heights[object.id] = { ...heights[object.id], height: value?.height ?? 0, capHeight: value?.capHeight ?? 0, arc: { top: 0, bottom: 0 } }
    }, { immediate: true })

    watch(() => scale.value[1], value => {
      heights[object.id] = { ...heights[object.id], scaleY: value }
    }, { immediate: true })

    onBeforeUnmount(() => {
      delete runtime[object.id]
      delete heights[object.id]
    })

    return () => null
  }
}
