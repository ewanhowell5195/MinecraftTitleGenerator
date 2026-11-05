import { computed, onBeforeUnmount, shallowRef, watch } from "vue"
import { image, preload, shapeFont, sheetFor, stripRange, textureList, tileableUrl } from "../lib/assets.js"
import { arcAssets, arcLayout } from "../lib/arc.js"
import { buildOutline, buildText } from "../lib/build.js"
import { framing } from "../lib/framing.js"
import { hasMarks, loadFont, sheetFolder } from "../lib/font.js"
import { thumbnailItem } from "../lib/layout.js"
import { blockTextureImage } from "../lib/minecraft.js"
import { R, paintBase, paintKey, paintSheet } from "../lib/paint.js"
import { quietly } from "../lib/history.js"
import { DEFAULT_CAP_HEIGHT, DEFAULT_HEIGHT, rowStart } from "../lib/rows.js"
import { editorTitle, keepTexture, loadedFont, words } from "../lib/scene.js"
import { activeOverlays, defaultBorder, defaultDepth, defaultSpacing, defaultTexture, setTexture, textureEntry } from "../lib/settings.js"

const BASE = ["font", "source", "texture", "textureVariant", "tileable", "tileableVariant", "tileableSource", "minecraftTexture", "minecraftVersion", "stops", "smooth", "gradientAngle", "arcGradient", "tileableScale", "tileableXOffset", "tileableYOffset", "tileableRandomRotations", "tileableRandomMirroring", "tileableTileEdges", "tileablePerCharacter", "disableFontOverlay", "edgeBrightness"]

const LAYOUT = new Set(["spacing", "kerning", "arcMode", "arcTop", "arcBottom", "arcMove", "arcMarked", "stretch", "terminators"])

export default {
  props: {
    object: { type: Object, required: true },
    fonts: { type: Array, required: true },
    tileables: { type: Object, required: true },
    title: { type: Object, default: () => editorTitle }
  },
  setup(props) {
    const object = props.object
    const { heights, runtime, view } = props.title
    const font = shallowRef(null)
    const sheet = shallowRef(null)
    const list = shallowRef(null)
    const painted = shallowRef(null)
    const shaped = shallowRef(null)
    const built = shallowRef(null)
    const preview = shallowRef(null)
    const error = shallowRef(null)
    let fontRequest = 0
    let paintRequest = 0
    let painting = false
    let pending = false
    let frame = 0
    let line = null
    let shown = null

    const source = computed(() => {
      if (object.textureSource === "gradient") return "gradient"
      if (object.textureSource === "tileable") return "tile"
      if (list.value && textureEntry(list.value, object)?.type === "strip") return "strip"
      return "texture"
    })

    const look = computed(() => ({
      font: font.value?.id,
      source: source.value,
      texture: object.texture,
      textureVariant: object.textureVariant,
      tileable: object.tileable,
      tileableVariant: object.tileableVariant,
      tileableSource: object.tileableSource,
      minecraftTexture: object.minecraftTexture,
      minecraftVersion: object.minecraftVersion,
      stops: object.stops.map(stop => ({ colour: stop.colour, position: stop.position })),
      smooth: object.smooth,
      gradientAngle: object.gradientAngle,
      arcGradient: object.arcGradient,
      overlays: activeOverlays(list.value, object, "overlays").map(layer => ({ ...layer })),
      edgeOverlays: activeOverlays(list.value, object, "edgeOverlays").map(layer => ({ ...layer })),
      tileableScale: object.tileableScale,
      tileableXOffset: object.tileableXOffset,
      tileableYOffset: object.tileableYOffset,
      tileableRandomRotations: object.tileableRandomRotations,
      tileableRandomMirroring: object.tileableRandomMirroring,
      tileableTileEdges: object.tileableTileEdges,
      tileablePerCharacter: object.tileablePerCharacter,
      disableFontOverlay: object.disableFontOverlay,
      hue: object.hue,
      saturation: object.saturation,
      brightness: object.brightness,
      contrast: object.contrast,
      colour: object.colour,
      blend: object.blend,
      colourOpacity: object.colourOpacity,
      customBorder: object.customBorder,
      borderColour: object.borderColour,
      fade: object.fade,
      outerFade: object.outerFade,
      customEdge: object.customEdge,
      edgeColour: object.edgeColour,
      edgeBrightness: object.edgeBrightness
    }))

    function typeDepth(value) {
      return object.type === "bottom" && !font.value?.flat ? value + 30 : value
    }

    const ownDepth = computed(() => object.wordDepth ?? object.depth)
    const depth = computed(() => typeDepth(ownDepth.value))

    const marked = computed(() => hasMarks(font.value))
    const stretching = computed(() => object.scaleMarked && marked.value)
    const meshScale = computed(() => [object.scaleX, stretching.value ? 1 : object.scaleY, object.scaleZ])
    const wordScale = computed(() => [object.wordScaleX, object.wordScaleMarked && marked.value ? 1 : object.wordScaleY, object.wordScaleZ])
    const totalScale = computed(() => meshScale.value.map((value, axis) => value * wordScale.value[axis]))
    const outlineGrow = computed(() => meshScale.value.map((value, axis) => (object.scaleOutline ? 1 : value) * (object.wordScaleOutline ? 1 : wordScale.value[axis])))

    const members = computed(() => words(object, props.title))

    function wordShape(other) {
      return {
        text: other.text,
        space: other.spaceBefore,
        arc: { mode: other.wordArcMode, top: other.wordArcTop / 100, bottom: other.wordArcBottom / 100, move: other.wordArcMove / 100, marked: other.wordArcMarked },
        stretch: other.wordScaleMarked && marked.value ? other.wordScaleY : 1
      }
    }

    const inputs = computed(() => ({
      words: members.value.map(wordShape),
      word: members.value.indexOf(object),
      depth: depth.value,
      lineDepth: typeDepth(object.depth),
      border: object.wordBorder ?? object.border,
      spacing: object.spacing,
      kerning: object.kerning,
      arcMode: object.arcMode,
      arcTop: object.arcTop / 100,
      arcBottom: object.arcBottom / 100,
      arcMove: object.arcMove / 100,
      arcMarked: object.arcMarked,
      stretch: stretching.value ? object.scaleY : 1,
      terminators: object.terminators,
      internalFaces: object.internalFaces,
      internalFade: object.fadeInternal ? object.internalFade / 100 : null,
      customInternal: object.customInternal,
      internalColour: object.internalColour,
      internalBrightness: object.internalBrightness,
      sideFaces: object.sideFaces,
      sideFade: object.fadeSides ? object.sideFade / 100 : null,
      customSide: object.customSide,
      sideColour: object.sideColour,
      sideBrightness: object.sideBrightness,
      customEdge: object.customEdge,
      edgeColour: object.edgeColour
    }))

    const transform = computed(() => {
      const height = font.value?.height ?? DEFAULT_HEIGHT
      const start = rowStart(object, props.title)
      const arc = heights[object.id]?.arc ?? { top: 0, bottom: 0 }
      const scale = meshScale.value
      const word = { scale: wordScale.value, userScale: [object.wordScaleX, object.wordScaleY, object.wordScaleZ], rotate: [object.wordRotationX, object.wordRotationY, object.wordRotationZ], translate: [object.wordTranslateX, object.wordTranslateY, object.wordTranslateZ] }
      const user = { rotate: [object.rotationX, object.rotationY, object.rotationZ], translate: [object.translateX, object.translateY, object.translateZ], outlineGrow: outlineGrow.value, userScale: [object.scaleX, object.scaleY, object.scaleZ], word }
      if (object.type === "bottom") return { ...user, scale, type: [0.78042, 1.67665, 0.77035], offset: [0, -(0.77035 * (height * 2 + 18.9862) + start + 1.67665 * arc.top), 7.6764 - 0.77035 * depth.value / 2], rotation: 90, anchor: { y: "top", z: "front" } }
      if (object.type === "small") return { ...user, scale, type: [0.39732, 0.43021, 0.33472], offset: [0, -(start + 3.6943 + (font.value?.capHeight ?? DEFAULT_CAP_HEIGHT) * 0.43021 + 0.43021 * arc.top), 3.0762 - 0.33472 * depth.value / 2], rotation: -0.4, anchor: { y: "top", z: "middle" } }
      return { ...user, scale, type: [1, 1, 1], offset: [0, start + arc.bottom, 11 - depth.value / 2], rotation: 0, anchor: { y: "bottom", z: "back" } }
    })

    function outlineScale() {
      const type = object.type === "bottom" ? transform.value.type : [1, 1, 1]
      return type.map((value, axis) => value * outlineGrow.value[axis])
    }

    function outlineFor(text) {
      return text && buildOutline(text, outlineScale())
    }

    const outline = computed(() => outlineFor(built.value))
    const previewOutline = computed(() => outlineFor(preview.value))
    const halo = computed(() => {
      if (!built.value || !view.render || !framing.outline) return null
      const scale = outlineScale()
      const { type } = transform.value
      return buildOutline(built.value, scale, scale.map((value, axis) => framing.outlineWidth * value / (type[axis] * totalScale.value[axis])))
    })

    function sheetImage(path) {
      return image(`${font.value.sheetFolder}/${path}`)
    }

    async function loadAssets(value) {
      const assets = { shape: sheetImage("textures/flat.png"), border: list.value.textures.flat?.border ?? "#000000", densities: [] }
      if (value.source === "gradient") assets.densities.push(1)
      if (value.source === "texture") {
        const premade = textureEntry(list.value, object)
        const id = premade ? object.textureVariant ?? object.texture : "flat"
        assets.base = sheetImage(`textures/${id}.png`)
        if (premade?.border) assets.border = premade.border
        assets.densities.push((premade || list.value.textures.flat)?.density ?? 1)
      }
      if (value.source === "strip") {
        const entry = textureEntry(list.value, object)
        const id = object.textureVariant ?? object.texture
        const range = stripRange(font.value)
        const strip = await sheetImage(`textures/${id}.png`)
        const depth = defaultDepth(font.value)
        const density = strip.height / (range.top - range.bottom + depth * 2)
        const tiling = entry.tiling ?? "line"
        if (tiling !== "line" && tiling !== "character") throw new Error(`${id} has tiling "${tiling}", strips tile by "line" or "character"`)
        assets.strip = { image: strip, density, top: range.top, bottom: range.bottom, depth, tiling }
        if (entry.border) assets.border = entry.border
        assets.densities.push(Math.max(1, density))
      }
      if (value.source === "tile") {
        assets.tile = object.tileableSource === "minecraft" ? blockTextureImage(object.minecraftVersion, object.minecraftTexture) : image(tileableUrl(props.tileables, object.tileable, object.tileableVariant))
        assets.densities.push(1 / object.tileableScale)
      }
      if (value.source !== "texture" && font.value.overlay && !object.disableFontOverlay) {
        assets.fontOverlay = sheetImage("overlay.png")
        assets.densities.push(1)
      }
      assets.overlays = []
      const files = []
      for (const layer of value.overlays) {
        if (layer.source === "file") {
          if (!layer.file) continue
          const file = image(layer.file)
          assets.overlays.push({ layer, source: file })
          files.push(file)
          continue
        }
        const entry = list.value.overlays[layer.overlay]
        if (!entry) continue
        if (entry.generated) {
          assets.overlays.push({ layer, source: { generated: entry.generated } })
          assets.densities.push(1)
        } else {
          assets.overlays.push({ layer, source: sheetImage(`overlays/${layer.overlay}.png`) })
          assets.densities.push(entry.density ?? 1)
        }
      }
      const keys = ["shape", "base", "tile", "fontOverlay"].filter(key => key in assets)
      const [loaded, overlays, sizes] = await Promise.all([Promise.all(keys.map(key => assets[key])), Promise.all(assets.overlays.map(async ({ layer, source }) => ({ layer, source: await source }))), Promise.all(files)])
      for (const [index, key] of keys.entries()) assets[key] = loaded[index]
      assets.overlays = overlays
      for (const file of sizes) assets.densities.push(file.width / sheet.value.width)
      assets.edgeOverlays = value.edgeOverlays.flatMap(layer => list.value.edgeOverlays[layer.overlay] ? [{ layer, generated: list.value.edgeOverlays[layer.overlay].generated }] : [])
      return assets
    }

    async function paint() {
      const value = look.value
      const token = ++paintRequest
      try {
        const assets = await loadAssets(value)
        if (token !== paintRequest) return
        shaped.value = assets.base ? shapeFont(font.value, sheet.value, assets.base) : font.value
        painted.value = { font: value.font, scale: R, edge: 1 / Math.min(...assets.densities, 4), edgeOnly: value.source === "tile", look: value, assets }
      } catch (err) {
        if (token === paintRequest) error.value = err.message
      }
    }

    async function repaint() {
      if (!font.value || !sheet.value || !list.value) return
      if (painting) {
        pending = true
        return
      }
      painting = true
      try {
        do {
          pending = false
          await paint()
          await new Promise(resolve => setTimeout(resolve))
        } while (pending)
      } finally {
        painting = false
      }
    }

    function lineFor(source, list, word, options) {
      const key = JSON.stringify([list, word, options.depth, options.arcMode, options.arcTop, options.arcBottom, options.arcMove, options.arcMarked, options.stretch, options.terminators, options.spacing, options.kerning])
      if (line?.painted === painted.value && line.source === source && line.key === key) return line
      const same = line?.source === source && line.key === key
      const laid = same ? line.arced : arcLayout(source, sheet.value, list, word, options)
      if (!laid) {
        line = { painted: painted.value, source, key, arced: laid }
        return line
      }
      const { look, assets } = painted.value
      const sheetKey = paintKey(laid.sheet, assets, look)
      const kept = same || line?.source === source && line.sheetKey === sheetKey
      const arced = kept ? { ...laid, sheet: line.arced.sheet } : laid
      if (kept && line.painted === painted.value) {
        line = { ...line, key, arced, sheetKey }
        return line
      }
      const remapped = arcAssets(assets, arced.sheet, sheet.value)
      const baseKey = JSON.stringify(BASE.map(name => look[name]))
      const base = kept && line.baseKey === baseKey ? line.base : paintBase(arced.sheet, look, remapped, source.capHeight)
      const own = { ...painted.value, ...paintSheet(arced.sheet, look, remapped, source.capHeight, base) }
      line = { painted: painted.value, source, key, arced, sheetKey, baseKey, base, own }
      return line
    }

    function measure(arc) {
      const known = heights[object.id]?.arc
      if (known?.top !== arc.top || known?.bottom !== arc.bottom) heights[object.id] = { ...heights[object.id], arc }
    }

    function previewFor(source, options, first, sheet, own) {
      const key = JSON.stringify([first.glyph.char, first.x, first.spaces, ownDepth.value, Object.entries(options).filter(([name]) => !LAYOUT.has(name))])
      if (shown?.source === source && shown.sheet === sheet && shown.own === own && shown.key === key) return shown.value
      const value = buildText(source, { ...options, depth: ownDepth.value, placed: [first], sheet, painted: own })
      shown = { source, sheet, own, key, value }
      return value
    }

    function rebuild() {
      frame = 0
      if (!font.value || !painted.value) return
      const { words: list, word, lineDepth, ...options } = inputs.value
      const source = shaped.value?.id === font.value.id ? shaped.value : font.value
      try {
        const { arced, own } = lineFor(source, list, word, options)
        measure(arced?.reach ?? { top: 0, bottom: 0 })
        if (!arced) {
          built.value = null
          preview.value = null
          error.value = null
          return
        }
        built.value = buildText(source, { ...options, lineDepth, placed: arced.placed, line: arced.line, sheet: arced.sheet, painted: own })
        const first = thumbnailItem(arced.placed)
        preview.value = first ? previewFor(source, options, first, arced.sheet, own) : null
        error.value = null
      } catch (err) {
        built.value = null
        preview.value = null
        error.value = err.message
      }
    }

    function schedule() {
      if (!frame) frame = requestAnimationFrame(rebuild)
    }

    async function pick(id) {
      const data = props.fonts.find(entry => entry.id === id) ?? props.fonts[0]
      if (!data) throw new Error("no fonts available")
      if (object.font !== data.id) quietly(() => (object.font = data.id))
      const token = ++fontRequest
      preload(sheetFolder(data, props.fonts))
      const loaded = await loadFont(data, props.fonts)
      const [layout, textures] = await Promise.all([sheetFor(loaded), textureList(loaded.sheetFolder)])
      if (token !== fontRequest) return
      if (!keepTexture.has(object) && loadedFont.get(object) !== loaded.id) {
        quietly(() => {
          const values = { texture: defaultTexture(textures, object.type), textureVariant: null }
          if (object.textureSource === "premade") setTexture(object, values)
          else Object.assign(object, values)
          object.overlays = object.overlays.filter(layer => layer.source === "file" || textures.overlays[layer.overlay])
          object.spacing = defaultSpacing(object.type, loaded)
          object.depth = defaultDepth(loaded)
          object.border = defaultBorder(object.type, loaded)
          object.wordDepth = null
          object.wordBorder = null
        })
      } else if (object.texture === null) quietly(() => (object.texture = defaultTexture(textures, object.type)))
      keepTexture.delete(object)
      loadedFont.set(object, loaded.id)
      font.value = loaded
      sheet.value = layout
      list.value = textures
      await repaint()
    }

    watch(look, repaint)
    watch([inputs, painted], schedule)
    watch(() => object.font, id => {
      if (font.value?.id !== id) pick(id).catch(err => (error.value = err.message))
    }, { immediate: true })
    watch([font, list, built, error, transform, outline, halo, preview, previewOutline, painted, () => object.font], () => {
      runtime[object.id] = { font: font.value, list: list.value, built: built.value, error: error.value, transform: transform.value, outline: outline.value, halo: halo.value, preview: preview.value && { built: preview.value, outline: previewOutline.value }, settled: painted.value?.font === object.font || !!error.value }
    }, { immediate: true })

    watch(font, value => {
      heights[object.id] = { ...heights[object.id], height: value?.height ?? DEFAULT_HEIGHT, capHeight: value?.capHeight ?? DEFAULT_CAP_HEIGHT }
    }, { immediate: true })

    watch(() => meshScale.value[1], value => {
      heights[object.id] = { ...heights[object.id], scaleY: value }
    }, { immediate: true })

    onBeforeUnmount(() => {
      cancelAnimationFrame(frame)
      delete runtime[object.id]
      delete heights[object.id]
    })

    return () => null
  }
}
