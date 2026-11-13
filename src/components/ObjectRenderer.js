import { computed, onBeforeUnmount, shallowRef, watch } from "vue"
import { bandOf, fontTextures, image, preload, shapeFont, sheetFor, stripBand, stripRange, tileableUrl } from "../lib/assets.js"
import { arcAssets, arcLayout } from "../lib/arc.js"
import { buildOutline, buildText } from "../lib/build.js"
import { canvasLimit } from "../lib/canvas.js"
import { customFontEntry, customFontId } from "../lib/customFonts.js"
import { EulaDeclined } from "../lib/eula.js"
import { SMOOTH_KINDS } from "../lib/generated.js"
import { CUSTOM_SHAPE, SILHOUETTE_TEXT, shapeOf } from "../lib/shapes.js"
import { hasMarks, loadFont, sheetFolder } from "../lib/font.js"
import { layerSlice, stackedStrip, stripRows } from "../lib/strips.js"
import { thumbnailItems } from "../lib/layout.js"
import { blockTextureImage } from "../lib/minecraft.js"
import { setHeights, usePlacement, usePublished } from "../lib/objectState.js"
import { R, lookKey, paintBase, paintKey, paintSheet } from "../lib/paint.js"
import { platform } from "../lib/platform.js"
import { quietly } from "../lib/history.js"
import { DEFAULT_CAP_HEIGHT, DEFAULT_HEIGHT, NO_ARC } from "../lib/rows.js"
import { editorTitle, keepTexture, loadedFont, words } from "../lib/scene.js"
import { activeOverlays, defaultBorder, defaultDepth, defaultSpacing, defaultTexture, effectiveScale, isCustomFont, layerTarget, setTexture, textureEntry } from "../lib/settings.js"

const BASE = ["font", "source", "textureSource", "texture", "textureVariant", "tileable", "tileableVariant", "tileableSource", "minecraftTexture", "minecraftVersion", "customTexture", "stops", "smooth", "gradientAngle", "arcGradient", "tileableScale", "tileableXOffset", "tileableYOffset", "tileableRandomRotations", "tileableRandomMirroring", "tileableTileEdges", "tileablePerCharacter", "disableFontOverlay", "edgeBrightness"]

const CUSTOM_SOURCES = { standard: "texture", tileable: "tile", strip: "strip" }

const REST = 0.5
const SHARPEN_DELAY = 250

const LAYOUT = new Set(["spacing", "kerning", "arcMode", "arcTop", "arcBottom", "arcMove", "arcCentre", "arcMarked", "stretch", "terminators", "twist"])

export default {
  props: {
    object: { type: Object, required: true },
    fonts: { type: Array, required: true },
    shapes: { type: Array, default: () => [] },
    tileables: { type: Object, required: true },
    title: { type: Object, default: () => editorTitle }
  },
  setup(props) {
    const object = props.object
    const { heights, view } = props.title
    const font = shallowRef(null)
    const sheet = shallowRef(null)
    const list = shallowRef(null)
    const painted = shallowRef(null)
    const shaped = shallowRef(null)
    const built = shallowRef(null)
    const preview = shallowRef(null)
    const fontError = shallowRef(null)
    const paintError = shallowRef(null)
    const buildError = shallowRef(null)
    const sharp = shallowRef(true)
    const error = computed(() => fontError.value ?? paintError.value ?? buildError.value)
    let fontRequest = 0
    let paintRequest = 0
    let painting = false
    let pending = false
    let frame = 0
    let rested = 0
    let sharpening = 0
    let line = null
    let shown = null
    let paintedKey = null
    let builtFrom = null

    function sourceOf(object) {
      if (object.textureSource === "gradient") return "gradient"
      if (object.textureSource === "tileable") return "tile"
      if (object.textureSource === "custom") return object.customTexture ? CUSTOM_SOURCES[object.customTextureMode] : "texture"
      if (list.value && textureEntry(list.value, object)?.type === "strip") return "strip"
      return "texture"
    }

    function plainStops(stops) {
      return stops.map(stop => ({ colour: stop.colour, position: stop.position }))
    }

    const layerCount = computed(() => font.value?.layers?.length ?? 1)
    const targets = computed(() => Array.from({ length: layerCount.value }, (_, layer) => layerTarget(object, layer)))
    const looks = computed(() => targets.value.map(lookOf))

    function lookOf(object) {
      return {
        font: font.value?.id,
        source: sourceOf(object),
        textureSource: object.textureSource,
        texture: object.texture,
        textureVariant: object.textureVariant,
        tileable: object.tileable,
        tileableVariant: object.tileableVariant,
        tileableSource: object.tileableSource,
        minecraftTexture: object.minecraftTexture,
        minecraftVersion: object.minecraftVersion,
        customTexture: object.customTexture,
        stops: plainStops(object.stops),
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
        edgeBrightness: object.edgeBrightness,
        edgeFill: object.edgeFill,
        edgeStops: plainStops(object.edgeStops),
        edgeSmooth: object.edgeSmooth,
        wordedFaces: object.customEdge && object.edgeFill === "gradient" || object.customInternal && object.internalFill === "gradient" && object.internalDirection === "along" || object.customSide && object.sideFill === "gradient" && object.sideDirection === "along"
      }
    }

    function typeDepth(value) {
      return object.type === "bottom" && !font.value?.flat ? value + 30 : value
    }

    const ownDepth = computed(() => object.wordDepth ?? object.depth)
    const depth = computed(() => typeDepth(ownDepth.value))

    const marked = computed(() => hasMarks(font.value))
    const stretching = computed(() => object.scaleMarked && marked.value)
    const meshScale = computed(() => {
      const [x, y, z] = effectiveScale(object)
      return [x, stretching.value ? 1 : y, z]
    })
    const wordScale = computed(() => [object.wordScaleX, object.wordScaleMarked && marked.value ? 1 : object.wordScaleY, object.wordScaleZ])

    const members = computed(() => words(object, props.title))

    function wordShape(other) {
      return {
        text: other.shape === null ? other.text : other.shape === CUSTOM_SHAPE ? SILHOUETTE_TEXT : font.value?.order ?? "",
        creeper: other.shape === null && other.creeperFace,
        space: other.spaceBefore,
        arc: { mode: other.wordArcMode, top: other.wordArcTop / 100, bottom: other.wordArcBottom / 100, move: other.wordArcMove / 100, centre: other.wordArcCentre / 100, marked: other.wordArcMarked },
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
      arcCentre: object.arcCentre / 100,
      arcMarked: object.arcMarked,
      twist: object.twistRibbon || object.twistDoor ? { ribbon: { amount: object.twistRibbon, centre: object.twistRibbonCentre / 100, same: object.twistRibbonMirror }, door: { amount: object.twistDoor, centre: object.twistDoorCentre / 100, same: object.twistDoorSame, roll: object.twistDoorRoll } } : null,
      stretch: stretching.value ? effectiveScale(object)[1] : 1,
      terminators: object.terminators,
      internalFaces: object.internalFaces,
      internalFade: object.fadeInternal ? object.internalFade / 100 : null,
      customInternal: object.customInternal,
      internalColour: object.internalColour,
      internalBrightness: object.internalBrightness,
      internalFill: object.internalFill,
      internalStops: plainStops(object.internalStops),
      internalSmooth: object.internalSmooth,
      internalDirection: object.internalDirection,
      sideFaces: object.sideFaces,
      sideFade: object.fadeSides ? object.sideFade / 100 : null,
      customSide: object.customSide,
      sideColour: object.sideColour,
      sideBrightness: object.sideBrightness,
      sideFill: object.sideFill,
      sideStops: plainStops(object.sideStops),
      sideSmooth: object.sideSmooth,
      sideDirection: object.sideDirection,
      customEdge: object.customEdge,
      edgeColour: object.edgeColour,
      edgeFill: object.edgeFill,
      edgeStops: plainStops(object.edgeStops),
      edgeSmooth: object.edgeSmooth
    }))

    function size() {
      return { height: font.value?.height ?? DEFAULT_HEIGHT, capHeight: font.value?.capHeight ?? DEFAULT_CAP_HEIGHT }
    }

    const { transform, outlineOf, haloOf } = usePlacement(object, props.title, { scale: meshScale, wordScale, measures: () => ({ ...size(), depth: depth.value, reference: typeDepth(defaultDepth(font.value)) }) })
    const outline = outlineOf(built, buildOutline)
    const previewOutline = outlineOf(preview, buildOutline)
    const halo = haloOf(built, buildOutline)

    function sheetImage(path) {
      return image(`${font.value.sheetFolder}/${path}`)
    }

    async function loadAssets(value, band = 0, target = object) {
      const assets = { shape: sheetImage("textures/flat.png"), border: list.value.textures.flat?.border ?? "#000000", densities: [] }
      if (value.source === "gradient") assets.densities.push(1)
      if (value.source === "texture" && target.textureSource === "custom") {
        assets.base = target.customTexture ? image(target.customTexture) : sheetImage("textures/flat.png")
      } else if (value.source === "texture") {
        const premade = textureEntry(list.value, target)
        const id = premade ? target.textureVariant ?? target.texture : "flat"
        assets.base = sheetImage(`textures/${id}.png`)
        if (premade?.border) assets.border = premade.border
        assets.densities.push((premade || list.value.textures.flat)?.density ?? 1)
      }
      if (value.source === "strip") {
        const custom = target.textureSource === "custom"
        const entry = custom ? {} : textureEntry(list.value, target)
        const id = custom ? "custom" : target.textureVariant ?? target.texture
        const loaded = await image(custom ? target.customTexture : `${entry.folder ?? font.value.sheetFolder}/textures/${id}.png`)
        const layers = font.value.layers
        const full = stripRows(entry, stripRange(font.value), defaultDepth(font.value), font.value.capHeight)
        const stacked = layers && !custom && !entry.stripSet ? stackedStrip(full, layers, band) : null
        const { depth, top, bottom, rows, scale } = stacked?.shape ?? full
        const density = loaded.height / (stacked?.total ?? rows)
        const strip = stacked ? stripBand(loaded, stacked.offset * density, rows * density) : loaded
        const tiling = entry.tiling ?? "line"
        if (tiling !== "line" && tiling !== "character") throw new Error(`${id} has tiling "${tiling}", strips tile by "line" or "character"`)
        const slice = layers && (stacked || entry.stripLayer != null) ? layerSlice(layers, band) : null
        assets.strip = { image: strip, density, top, bottom, depth, tiling, scale, slice }
        if (entry.border) assets.border = entry.border
        assets.densities.push(Math.max(1, density))
      }
      if (value.source === "tile") {
        assets.tile = target.textureSource === "custom" ? image(target.customTexture) : target.tileableSource === "minecraft" ? blockTextureImage(target.minecraftVersion, target.minecraftTexture) : image(tileableUrl(props.tileables, target.tileable, target.tileableVariant))
        assets.densities.push(1 / target.tileableScale)
      }
      if (value.source !== "texture" && font.value.overlay && (target.textureSource === "premade" || !target.disableFontOverlay)) {
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
      const fromFont = new Set(["shape", "fontOverlay"].concat(value.source === "texture" && !(target.textureSource === "custom" && target.customTexture) ? ["base"] : []))
      for (const [index, key] of keys.entries()) assets[key] = fromFont.has(key) ? bandOf(loaded[index], band, font.value) : loaded[index]
      assets.overlays = overlays.map(({ layer, source }) => layer.source === "file" || source.generated ? { layer, source } : { layer, source: bandOf(source, band, font.value) })
      for (const file of sizes) assets.densities.push(file.width / sheet.value.width)
      if (value.source === "texture" && target.textureSource === "custom") assets.densities.push(assets.base.width / sheet.value.width)
      assets.edgeOverlays = value.edgeOverlays.flatMap(layer => list.value.edgeOverlays[layer.overlay] ? [{ layer, generated: list.value.edgeOverlays[layer.overlay].generated }] : [])
      return assets
    }

    function paintedLayer(value, assets) {
      return { edge: 1 / Math.min(...assets.densities, 4), edgeOnly: value.source === "tile", look: value, assets }
    }

    async function paint() {
      const values = looks.value
      const key = lookKey(values)
      if (key === paintedKey) return
      const token = ++paintRequest
      try {
        const loaded = await Promise.all(values.map((value, layer) => loadAssets(value, layer, targets.value[layer])))
        if (token !== paintRequest) return
        const [assets] = loaded
        shaped.value = assets.base && !font.value.mesh && !font.value.layers ? shapeFont(font.value, sheet.value, assets.base) : font.value
        const layers = values.map((value, layer) => paintedLayer(value, loaded[layer]))
        painted.value = { font: values[0].font, scale: R, ...layers[0], layers: font.value.layers ? layers : null }
        paintedKey = key
        paintError.value = null
      } catch (err) {
        paintedKey = null
        if (token === paintRequest && !(err instanceof EulaDeclined)) paintError.value = err.message
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
      const key = JSON.stringify([list, word, options.depth, options.arcMode, options.arcTop, options.arcBottom, options.arcMove, options.arcCentre, options.arcMarked, options.stretch, options.terminators, options.spacing, options.kerning])
      const same = line?.source === source && line.key === key
      if (same && line.painted === painted.value) return line
      const laid = same ? line.laid : arcLayout(source, sheet.value, list, word, options)
      if (!laid) {
        line = { painted: painted.value, source, key, laid, arced: null }
        return line
      }
      const layers = painted.value.layers ?? [painted.value]
      const { look, assets } = layers[0]
      const held = line?.source === source ? line.arced?.sheet : null
      const kept = held && (held === laid.sheet || paintKey(held, assets, look) === paintKey(laid.sheet, assets, look))
      const arced = kept ? { ...laid, sheet: held } : laid
      if (kept && line.painted === painted.value) {
        line = { ...line, key, laid, arced }
        return line
      }
      const parts = layers.map((layer, index) => {
        const remapped = arcAssets(layer.assets, arced.sheet, sheet.value)
        const baseKey = lookKey(BASE.map(name => layer.look[name]))
        const before = kept ? line.parts?.[index] : null
        const base = before?.baseKey === baseKey ? before.base : paintBase(arced.sheet, layer.look, remapped, source.capHeight)
        return { baseKey, base, remapped, own: { ...painted.value, ...layer, ...paintSheet(arced.sheet, layer.look, remapped, source.capHeight, base) } }
      })
      line = { painted: painted.value, source, key, laid, arced, parts }
      return line
    }

    function owned(parts) {
      return painted.value.layers ? parts.map(part => part.own) : parts[0].own
    }

    function layerOptions() {
      return painted.value.layers ? targets.value.map(target => ({ options: { customEdge: target.customEdge, edgeColour: target.edgeColour, edgeFill: target.edgeFill, edgeStops: plainStops(target.edgeStops), edgeSmooth: target.edgeSmooth } })) : null
    }

    function detailed(options) {
      return (painted.value.layers ?? [painted.value]).some(({ look, assets }) => {
        const gradient = look.source === "gradient" || look.customEdge && look.edgeFill === "gradient" || options.internalFaces && options.customInternal && options.internalFill === "gradient" || options.sideFaces && options.customSide && options.sideFill === "gradient"
        return gradient || assets.overlays.some(({ layer, source }) => SMOOTH_KINDS.has(source.generated) && layer.opacity > 0)
      })
    }

    function sharpened(text, source) {
      const { arced, parts } = line
      let detail = text.detail
      while (detail > 1 && Math.max(arced.sheet.width, arced.sheet.height) * R * detail > canvasLimit()) detail /= 2
      const sharp = parts.map(({ own, remapped }) => ({ own: { ...own, ...paintSheet(arced.sheet, own.look, remapped, source.capHeight, paintBase(arced.sheet, own.look, remapped, source.capHeight, detail), detail) } }))
      const plain = { image: text.texture, labels: text.labels, crackShapes: text.crackShapes, gradient: text.gradient, fades: text.fades, panels: text.panels }
      return { ...text, ...text.refine(owned(sharp)), refine: null, plain }
    }

    function sharpen(text, source) {
      clearTimeout(sharpening)
      sharp.value = !text?.refine
      if (sharp.value) return
      if (view.eager) {
        built.value = sharpened(text, source)
        sharp.value = true
        return
      }
      sharpening = setTimeout(() => {
        if (built.value !== text) return
        try {
          built.value = sharpened(text, source)
        } catch (err) {
          buildError.value = err.message
        }
        sharp.value = true
      }, SHARPEN_DELAY)
    }

    function measure(arc) {
      const known = heights[object.id]?.arc
      if (known?.top !== arc.top || known?.bottom !== arc.bottom) setHeights(object, props.title, { arc })
    }

    function twistedReach(text, reach) {
      if (!text?.twist) return reach
      const positions = text.body.positions
      let low = Infinity
      let high = -Infinity
      for (let at = 1; at < positions.length; at += 3) {
        low = Math.min(low, positions[at])
        high = Math.max(high, positions[at])
      }
      return { top: reach.top + Math.max(0, high - text.line.max[1]), bottom: reach.bottom + Math.max(0, text.line.min[1] - low) }
    }

    function previewFor(source, options, placed, sheet, parts) {
      const key = JSON.stringify([placed.map(item => [item.glyph.char, item.glyph.width, item.x, item.spaces]), ownDepth.value, Object.entries(options).filter(([name]) => !LAYOUT.has(name))])
      if (shown?.source === source && shown.sheet === sheet && shown.parts === parts && shown.key === key) return shown.value
      const value = buildText(source, { ...options, twist: null, depth: ownDepth.value, placed, sheet, painted: owned(parts), layers: layerOptions() })
      shown = { source, sheet, parts, key, value }
      return value
    }

    function rebuild() {
      if (!font.value || painted.value?.font !== font.value.id) return
      const { words: list, word, lineDepth, ...options } = inputs.value
      const source = shaped.value?.id === font.value.id ? shaped.value : font.value
      const inputsKey = JSON.stringify(inputs.value)
      if (builtFrom?.painted === painted.value && builtFrom.source === source && builtFrom.inputsKey === inputsKey) return
      builtFrom = { painted: painted.value, source, inputsKey }
      let reach = null
      try {
        const { arced, parts } = lineFor(source, list, word, options)
        reach = arced?.reach ?? NO_ARC
        if (!arced) {
          built.value = null
          preview.value = null
          buildError.value = null
          sharpen(null)
          return
        }
        built.value = buildText(source, { ...options, lineDepth, placed: arced.placed, line: arced.line, ends: arced.ends, sheet: arced.sheet, painted: owned(parts), layers: layerOptions(), detailed: detailed(options), textureLimit: platform.maxTextureSize() })
        reach = twistedReach(built.value, arced.reach)
        const thumbnail = view.previews === false ? [] : thumbnailItems(source, arced.placed)
        preview.value = thumbnail.length ? previewFor(source, options, thumbnail, arced.sheet, parts) : null
        buildError.value = null
        sharpen(built.value, source)
      } catch (err) {
        builtFrom = null
        built.value = null
        preview.value = null
        buildError.value = err.message
        sharpen(null)
      } finally {
        if (reach) measure(reach)
      }
    }

    function tick() {
      if (performance.now() < rested) {
        frame = platform.frame(tick)
        return
      }
      frame = 0
      const began = performance.now()
      rebuild()
      const ended = performance.now()
      rested = ended + (ended - began) * REST
    }

    function schedule() {
      if (!frame) frame = platform.frame(tick)
    }

    async function pick(id) {
      const token = ++fontRequest
      const customShape = object.shape === CUSTOM_SHAPE
      if (customShape && !object.customFont) throw new Error("this custom shape has no PNG")
      const shape = object.shape === null || customShape ? null : shapeOf(props.shapes, object.shape)
      const custom = !shape && isCustomFont(id) && object.customFont ? await customFontEntry(object.customFont) : null
      if (token !== fontRequest) return
      const fonts = shape ? [] : custom ? props.fonts.concat(custom) : props.fonts
      const data = shape ?? custom ?? props.fonts.find(entry => entry.id === id) ?? props.fonts[0]
      if (!data) throw new Error("no fonts available")
      if (!shape && !customShape && object.font !== data.id) quietly(() => (object.font = data.id))
      preload(sheetFolder(data, fonts))
      const loaded = await loadFont(data, fonts)
      const [layout, textures] = await Promise.all([sheetFor(loaded), fontTextures(loaded.sheetFolder, loaded.strips)])
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
      if (loaded.mesh && object.textureSource === "custom") quietly(() => setTexture(object, { textureSource: "premade" }))
      keepTexture.delete(object)
      loadedFont.set(object, loaded.id)
      font.value = loaded
      sheet.value = layout
      list.value = textures
      fontError.value = null
      await repaint()
    }

    watch(looks, repaint)
    watch([inputs, painted], schedule)
    const wanted = computed(() => {
      if (object.shape !== CUSTOM_SHAPE) return object.shape ?? object.font
      return object.customFont ? customFontId(object.customFont) : CUSTOM_SHAPE
    })

    watch(wanted, id => {
      if (font.value?.id === id) {
        fontRequest++
        fontError.value = null
        return
      }
      const loading = pick(id)
      const token = fontRequest
      loading.catch(err => {
        if (token === fontRequest) fontError.value = err.message
      })
    }, { immediate: true })

    usePublished(object, props.title, {
      size,
      scaleY: () => meshScale.value[1],
      entry: () => ({ font: font.value, list: list.value, built: built.value, error: error.value, transform: transform.value, outline: outline.value, halo: halo.value, preview: preview.value && { built: preview.value, outline: previewOutline.value }, settled: painted.value?.font === wanted.value || !!error.value, sharp: sharp.value })
    })

    onBeforeUnmount(() => {
      platform.cancelFrame(frame)
      clearTimeout(sharpening)
    })

    return () => null
  }
}
