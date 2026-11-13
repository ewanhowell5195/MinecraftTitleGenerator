import { computed, shallowRef, watch } from "vue"
import { image, modelOf, modelTextures } from "../lib/assets.js"
import { rowBottom } from "../lib/build.js"
import { surface } from "../lib/canvas.js"
import { quietly } from "../lib/history.js"
import { adjusted, borderOf, colourOverlay, lookKey } from "../lib/paint.js"
import { atlasOf, bodyOf, faceOutline, footprint, minecraftPlaced, modelQuads, packing, placed, solidAdjusted, solidRuns, wholeCubes } from "../lib/modelShape.js"
import { usePlacement, usePublished } from "../lib/objectState.js"
import { NO_ARC } from "../lib/rows.js"
import { editorTitle, keepTexture, loadedFont } from "../lib/scene.js"
import { activeOverlays, defaultTexture, effectiveScale, setTexture, textureEntry } from "../lib/settings.js"
import { minecraftQuads } from "../lib/minecraftModels.js"
import { CUSTOM_SHAPE, MODEL_BASELINE, SHAPE_TEXTURE, isMinecraftShape, minecraftShapeParts, modelHeight, shapeName, shapeOf } from "../lib/shapes.js"

const BLOCK_TURN = 180
const MINECRAFT_BORDER = "#000000"
const MINECRAFT_LIST = { textures: {}, overlays: {}, edgeOverlays: {} }

export default {
  props: {
    object: { type: Object, required: true },
    shapes: { type: Array, required: true },
    title: { type: Object, default: () => editorTitle }
  },
  setup(props) {
    const object = props.object
    const shape = shallowRef(null)
    const model = shallowRef(null)
    const list = shallowRef(null)
    const built = shallowRef(null)
    const loadError = shallowRef(null)
    const paintError = shallowRef(null)
    const error = computed(() => loadError.value ?? paintError.value)
    const painted = shallowRef(null)
    let request = 0
    let paintRequest = 0
    let shaped = null

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
    const depth = computed(() => painted.value?.depth ?? 0)

    function size() {
      return { height: font.value?.height ?? 0, capHeight: font.value?.capHeight ?? 0 }
    }

    function shell(value, grown, extra = [0, 0, 0]) {
      return faceOutline(value.runs, grown, extra.map(amount => object.border + amount), value.swatch)
    }

    const { transform, outlineOf, haloOf } = usePlacement(object, props.title, { scale, wordScale, measures: () => ({ ...size(), depth: depth.value, reference: depth.value }) })
    const outline = outlineOf(built, shell)
    const halo = haloOf(built, shell)

    async function pickMinecraft(id, token) {
      const { kind, id: name } = minecraftShapeParts(id)
      if (!object.shapeVersion) throw new Error("this Minecraft shape has no game version")
      const data = await minecraftQuads(kind, name, object.shapeVersion, kind === "block" ? object.blockState : null)
      if (token !== request) return
      const sources = Object.fromEntries(Object.entries(data.sources).map(([key, picture]) => {
        const copy = surface(picture.width, picture.height, { willReadFrequently: true })
        copy.ctx.drawImage(picture, 0, 0)
        return [key, copy.canvas]
      }))
      const quads = minecraftPlaced(wholeCubes(data.quads), kind === "block" ? BLOCK_TURN : 0)
      const top = Math.max(...quads.flatMap(quad => quad.points.map(point => point[1])))
      keepTexture.delete(object)
      loadedFont.set(object, id)
      shape.value = { id, name: shapeName(props.shapes, id), minecraft: true, height: Math.round(top) + MODEL_BASELINE }
      model.value = { quads, sources }
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

    function shapedFrom(sources, key) {
      if (shaped?.model === model.value && shaped.key === key) return shaped
      const { faces, depth } = placed(shape.value.minecraft ? model.value.quads : modelQuads(model.value, sources.base))
      const runs = solidRuns(faces, sources)
      const layout = packing(faces)
      const points = faces.flatMap(face => face.points)
      const line = { min: [Math.min(...points.map(point => point[0])), Math.min(...points.map(point => point[1])), -depth / 2], max: [Math.max(...points.map(point => point[0])), Math.max(...points.map(point => point[1])), depth / 2] }
      shaped = { model: model.value, key, depth, runs, layout, line, body: bodyOf(layout.cells, layout.width, layout.height), bottom: rowBottom([footprint(runs)]), swatch: [0.5 / layout.width, 1 - (layout.swatchY + 0.5) / layout.height] }
      return shaped
    }

    async function paint() {
      if (!shape.value || !model.value || !list.value) return
      const token = ++paintRequest
      try {
        const value = look.value
        const minecraft = shape.value.minecraft
        const { sources, border } = minecraft ? { sources: model.value.sources, border: borderOf(value, { border: MINECRAFT_BORDER }) } : await textureCanvas(value).then(({ canvas, border }) => ({ sources: { base: canvas }, border }))
        if (token !== paintRequest) return
        const { depth: modelDepth, runs, layout, line, body, bottom, swatch } = shapedFrom(sources, minecraft ? null : lookKey([shape.value.textureUrl, value.texture, value.textureVariant, value.blend, value.colourOpacity, value.overlays]))
        const drawn = atlasOf(layout, sources)
        const atlas = minecraft ? solidAdjusted(drawn, value, layout.width, layout.swatchY) : drawn
        atlas.ctx.fillStyle = `rgba(${border[0]}, ${border[1]}, ${border[2]}, ${border[3] / 255})`
        atlas.ctx.fillRect(0, layout.swatchY, 1, 1)
        built.value = { body, texture: atlas.canvas, depth: modelDepth, get border() { return object.border }, bottom, line, frame: null, shapes: null, tools: null, twist: null, swatch, averages: null, runs }
        painted.value = { shape: shape.value.id, depth: modelDepth }
        paintError.value = null
      } catch (err) {
        if (token === paintRequest) paintError.value = err.message
      }
    }

    function load() {
      const loading = pick(object.shape)
      const token = request
      loading.then(() => {
        if (token === request) loadError.value = null
      }, err => {
        if (token === request) loadError.value = err.message
      })
    }

    watch(() => [object.shape, object.shapeVersion, JSON.stringify(object.blockState), object.customModel], load, { immediate: true })
    watch([look, model, list], paint, { immediate: true })

    usePublished(object, props.title, {
      size: () => ({ ...size(), arc: NO_ARC }),
      scaleY: () => scale.value[1],
      entry: () => ({ font: font.value, list: list.value, built: built.value, error: error.value, transform: transform.value, outline: outline.value, halo: halo.value, preview: built.value && { built: built.value, outline: outline.value }, settled: painted.value?.shape === object.shape || !!error.value })
    })

    return () => null
  }
}
