import { computed, onBeforeUnmount, shallowRef, watch } from "vue"
import { image, modelOf, modelTextures } from "../lib/assets.js"
import { buildOutline, rowBottom } from "../lib/build.js"
import { surface } from "../lib/canvas.js"
import { framing } from "../lib/framing.js"
import { quietly } from "../lib/history.js"
import { adjusted, borderOf, colourOverlay } from "../lib/paint.js"
import { placementOf } from "../lib/placement.js"
import { editorTitle, keepTexture, loadedFont } from "../lib/scene.js"
import { activeOverlays, defaultTexture, effectiveScale, setTexture, textureEntry } from "../lib/settings.js"
import { shapeOf } from "../lib/shapes.js"

const BASELINE = 2
const SHADE = { north: 1, south: 1, up: 1, down: 0.6, east: 0.75, west: 0.75 }

function corners(side, [x1, y1, z1], [x2, y2, z2]) {
  if (side === "north") return [[x2, y2, z1], [x1, y2, z1], [x1, y1, z1], [x2, y1, z1]]
  if (side === "south") return [[x1, y2, z2], [x2, y2, z2], [x2, y1, z2], [x1, y1, z2]]
  if (side === "east") return [[x2, y2, z2], [x2, y2, z1], [x2, y1, z1], [x2, y1, z2]]
  if (side === "west") return [[x1, y2, z1], [x1, y2, z2], [x1, y1, z2], [x1, y1, z1]]
  if (side === "up") return [[x1, y2, z1], [x2, y2, z1], [x2, y2, z2], [x1, y2, z2]]
  return [[x1, y1, z2], [x2, y1, z2], [x2, y1, z1], [x1, y1, z1]]
}

function rotated(point, rotation) {
  if (!rotation?.angle) return point
  const angle = rotation.angle * Math.PI / 180
  const [ox, oy, oz] = rotation.origin
  const [x, y, z] = [point[0] - ox, point[1] - oy, point[2] - oz]
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  if (rotation.axis === "x") return [x + ox, y * cos - z * sin + oy, y * sin + z * cos + oz]
  if (rotation.axis === "y") return [x * cos + z * sin + ox, y + oy, -x * sin + z * cos + oz]
  return [x * cos - y * sin + ox, x * sin + y * cos + oy, z + oz]
}

function facesOf(model) {
  const [width, height] = model.texture_size
  return model.elements.flatMap(element => Object.entries(element.faces).map(([side, face]) => {
    const [u1, v1, u2, v2] = face.uv.map((value, index) => Math.round(value * (index % 2 ? height : width) / 16))
    return { side, points: corners(side, element.from, element.to).map(point => rotated(point, element.rotation)), uv: [u1, v1, u2, v2] }
  }))
}

function placed(faces) {
  const points = faces.flatMap(face => face.points).map(([x, y, z]) => [-x, y, -z])
  const minX = Math.min(...points.map(point => point[0]))
  const maxX = Math.max(...points.map(point => point[0]))
  const minZ = Math.min(...points.map(point => point[2]))
  const maxZ = Math.max(...points.map(point => point[2]))
  const shift = ([x, y, z]) => [-x - (minX + maxX) / 2, y - BASELINE, -z - (minZ + maxZ) / 2]
  return { faces: faces.map(face => ({ ...face, points: face.points.map(shift) })), depth: maxZ - minZ }
}

function packed(faces, source, shade) {
  const cells = faces.map(face => {
    const [u1, v1, u2, v2] = face.uv
    return { face, x: Math.min(u1, u2), y: Math.min(v1, v2), width: Math.max(1, Math.abs(u2 - u1)), height: Math.max(1, Math.abs(v2 - v1)) }
  })
  const width = Math.max(...cells.map(cell => cell.width))
  const height = cells.reduce((sum, cell) => sum + cell.height, 0) + 1
  const atlas = surface(width, height)
  let y = 0
  for (const cell of cells) {
    cell.at = y
    atlas.ctx.drawImage(source, cell.x, cell.y, cell.width, cell.height, 0, y, cell.width, cell.height)
    const factor = shade[cell.face.side]
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
  for (const { face, at, width: cellWidth, height: cellHeight } of cells) {
    const [u1, v1, u2, v2] = face.uv
    const left = u1 <= u2 ? 0 : cellWidth
    const right = cellWidth - left
    const top = v1 <= v2 ? 0 : cellHeight
    const bottom = cellHeight - top
    const coords = [[left, top], [right, top], [right, bottom], [left, bottom]].map(([x, y]) => [x / width, 1 - (at + y) / height])
    for (const index of [0, 3, 2, 0, 2, 1]) {
      positions.push(...face.points[index])
      uvs.push(...coords[index])
    }
  }
  return { positions: new Float32Array(positions), uvs: new Float32Array(uvs), triangles: positions.length / 9, sizes: null }
}

function footprint(faces, source) {
  const pixels = source.getContext("2d").getImageData(0, 0, source.width, source.height).data
  const opaque = (x, y) => x >= 0 && y >= 0 && x < source.width && y < source.height && pixels[(y * source.width + x) * 4 + 3] >= 128
  const rects = []
  for (const face of faces) {
    if (face.side !== "north" && face.side !== "south") continue
    const [u1, v1, u2, v2] = face.uv
    const [tl, tr, , bl] = face.points
    const columns = Math.abs(u2 - u1)
    const rows = Math.abs(v2 - v1)
    if (!columns || !rows) continue
    const at = (s, t) => [0, 1].map(axis => tl[axis] + (tr[axis] - tl[axis]) * s + (bl[axis] - tl[axis]) * t)
    for (let row = 0; row < rows; row++) {
      let start = null
      for (let column = 0; column <= columns; column++) {
        const x = Math.min(u1, u2) + column
        const y = Math.min(v1, v2) + row
        const solid = column < columns && opaque(x, y)
        if (solid && start === null) start = column
        if (solid || start === null) continue
        const along = value => u1 <= u2 ? value / columns : 1 - value / columns
        const down = value => v1 <= v2 ? value / rows : 1 - value / rows
        const points = [at(along(start), down(row)), at(along(column), down(row + 1))]
        rects.push({ from: [Math.min(points[0][0], points[1][0]), Math.min(points[0][1], points[1][1])], to: [Math.max(points[0][0], points[1][0]), Math.max(points[0][1], points[1][1])] })
        start = null
      }
    }
  }
  return rects
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

    const font = computed(() => shape.value && { id: shape.value.id, name: shape.value.name, folder: shape.value.folder, sheetFolder: shape.value.folder, model: true, height: shape.value.height, capHeight: shape.value.height - 4 })

    const look = computed(() => ({
      shape: shape.value?.id,
      texture: object.texture,
      textureVariant: object.textureVariant,
      overlays: list.value ? activeOverlays(list.value, object, "overlays").map(layer => ({ ...layer })) : [],
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

    const outline = computed(() => built.value && buildOutline(built.value, outlineScale()))
    const halo = computed(() => {
      if (!built.value || !view.render || !framing.outline) return null
      const size = outlineScale()
      const { type } = transform.value
      const total = scale.value.map((value, axis) => value * wordScale.value[axis])
      return buildOutline(built.value, size, size.map((value, axis) => framing.outlineWidth * value / (type[axis] * total[axis])))
    })

    async function pick(id) {
      const token = ++request
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
      const base = await image(`${shape.value.folder}/textures/${id}.png`)
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
        const { canvas, border } = await textureCanvas(value)
        if (token !== paintRequest) return
        const { faces, depth: modelDepth } = placed(facesOf(model.value))
        const { atlas, cells, width, height, swatchY } = packed(faces, canvas, SHADE)
        atlas.ctx.fillStyle = `rgba(${border[0]}, ${border[1]}, ${border[2]}, ${border[3] / 255})`
        atlas.ctx.fillRect(0, swatchY, 1, 1)
        const boxes = footprint(faces, canvas)
        const points = faces.flatMap(face => face.points)
        const line = { min: [Math.min(...points.map(point => point[0])), Math.min(...points.map(point => point[1])), -modelDepth / 2], max: [Math.max(...points.map(point => point[0])), Math.max(...points.map(point => point[1])), modelDepth / 2] }
        built.value = { body: bodyOf(cells, width, height), texture: atlas.canvas, depth: modelDepth, border: object.border, boxes: boxes.map(box => [box.from, box.to]), bottom: rowBottom([boxes]), line, frame: null, shapes: null, tools: null, twist: null, swatch: [0.5 / width, 1 - (swatchY + 0.5) / height], averages: null }
        painted.value = { shape: shape.value.id, depth: modelDepth }
        error.value = null
      } catch (err) {
        if (token === paintRequest) error.value = err.message
      }
    }

    watch(() => object.shape, id => pick(id).catch(err => (error.value = err.message)), { immediate: true })
    watch([look, model, list, () => object.border], paint)
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
