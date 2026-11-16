import { computed, onBeforeUnmount, shallowRef, watch } from "vue"
import { bandOf, filePalette, fontTextures, image, preload, shapeFont, sheetFor, stripBand, stripLayout, tileableUrl } from "../lib/texture/assets.js"
import { definitionPalette } from "../lib/texture/overlayColours.js"
import { arcAssets, arcLayout } from "../lib/geometry/arc.js"
import { buildOutline, buildText } from "../lib/geometry/build.js"
import { MAX_DETAIL } from "../lib/texture/atlas.js"
import { textureLimit } from "../lib/texture/canvas.js"
import { customFontEntry, customFontId } from "../lib/font/customFonts.js"
import { EulaDeclined } from "../lib/minecraft/eula.js"
import { FADE_KINDS, SMOOTH_KINDS, WRAPPED_KINDS } from "../lib/texture/overlays/settings.js"
import { withDraftShadows, withFinalShadows } from "../lib/texture/overlays/shadows.js"
import { CUSTOM_SHAPE, SILHOUETTE_TEXT, shapeOf } from "../lib/geometry/shapes.js"
import { hasMarks, loadFont, sheetFolder } from "../lib/font/font.js"
import { bandEntry, layerSlice } from "../lib/font/strips.js"
import { independentLayers } from "../lib/font/flatSheet.js"
import { thumbnailItems } from "../lib/geometry/layout.js"
import { blockTextureImage } from "../lib/minecraft/minecraft.js"
import { setHeights, usePlacement, usePublished } from "./objectState.js"
import { faceDepth } from "../lib/texture/material.js"
import { idOf, lookKey, paintBase, paintKey, paintSheet, stripDetail } from "../lib/texture/paint.js"
import { platform } from "../lib/core/platform.js"
import { quietly } from "../lib/state/history.js"
import { DEFAULT_CAP_HEIGHT, DEFAULT_HEIGHT, NO_ARC } from "../lib/geometry/rows.js"
import { editorTitle, finalShadows, keepTexture, loadedFont, words } from "../lib/state/scene.js"
import { activeOverlays, applyFontFaces, defaultBorder, defaultDepth, defaultSpacing, defaultTexture, effectiveScale, fontFaces, isCustomFont, isSeparate, layerTarget, sameValue, separateForDefaults, setTexture, textureEntry } from "../lib/settings/settings.js"

const BASE = ["font", "source", "textureSource", "texture", "textureVariant", "tileable", "tileableVariant", "tileableSource", "minecraftTexture", "minecraftVersion", "customTexture", "stops", "smooth", "gradientAngle", "arcGradient", "tileableScale", "tileableXOffset", "tileableYOffset", "tileableRandomRotations", "tileableRandomMirroring", "tileableTileEdges", "tileablePerCharacter", "disableFontOverlay", "edgeBrightness"]

const CUSTOM_SOURCES = { standard: "texture", tileable: "tile", strip: "strip" }
const loadedFaces = new WeakMap()

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
    const finalShadowed = computed(() => finalShadows.value && !!painted.value && (painted.value.layers ?? [painted.value]).some(({ assets }) => assets.overlays.some(({ layer, source }) => source.generated === "shadow" && layer.opacity > 0)))
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
    const paintCache = new Map()
    let paintUsed = new Set()
    let paintKept = new Set()

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
    const looks = computed(() => targets.value.map((target, layer) => lookOf(target, isSeparate(object, "overlays") ? layer : 0)))

    function lookOf(object, layer = 0) {
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
        overlays: activeOverlays(list.value, object, "overlays", layer).map(entry => ({ ...entry })),
        edgeOverlays: activeOverlays(list.value, object, "edgeOverlays", layer).map(entry => ({ ...entry })),
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
      ...faceOptions(object)
    }))

    const layerFaces = computed(() => targets.value.map(faceOptions))

    function faceOptions(target) {
      return {
        internalFaces: target.internalFaces,
        internalFade: target.fadeInternal ? target.internalFade / 100 : null,
        customInternal: target.customInternal,
        internalColour: target.internalColour,
        internalBrightness: target.internalBrightness,
        internalFill: target.internalFill,
        internalStops: plainStops(target.internalStops),
        internalSmooth: target.internalSmooth,
        internalDirection: target.internalDirection,
        sideFaces: target.sideFaces,
        sideFade: target.fadeSides ? target.sideFade / 100 : null,
        customSide: target.customSide,
        sideColour: target.sideColour,
        sideBrightness: target.sideBrightness,
        sideFill: target.sideFill,
        sideStops: plainStops(target.sideStops),
        sideSmooth: target.sideSmooth,
        sideDirection: target.sideDirection,
        customEdge: target.customEdge,
        edgeColour: target.edgeColour,
        edgeFill: target.edgeFill,
        edgeStops: plainStops(target.edgeStops),
        edgeSmooth: target.edgeSmooth
      }
    }

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
      const assets = { shape: sheetImage("textures/flat.png"), border: list.value.textures.flat?.border ?? "#000000", densities: [], band: font.value.layers ? band : null, independent: independentLayers(font.value) }
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
        const entry = custom ? {} : bandEntry(textureEntry(list.value, target), band)
        const id = custom ? "custom" : target.textureVariant ?? target.texture
        const loaded = await image(custom ? target.customTexture : `${entry.folder ?? font.value.sheetFolder}/textures/${id}.png`)
        const layers = font.value.layers
        const layout = stripLayout(entry, font.value, defaultDepth(font.value), band)
        const { depth, top, bottom, rows, scale } = layout.shape
        const density = loaded.height / layout.total
        const strip = layout.stacked ? stripBand(loaded, layout.offset * density, rows * density) : loaded
        const tiling = entry.tiling ?? "line"
        if (tiling !== "line" && tiling !== "character") throw new Error(`${id} has tiling "${tiling}", strips tile by "line" or "character"`)
        const slice = layers && (layout.stacked || entry.stripLayer != null) ? layerSlice(layers, band, independentLayers(font.value)) : null
        assets.strip = { image: strip, density, snap: (entry.snap ?? 1) / density, top, bottom, depth, tiling, scale, slice, band: assets.band, independent: assets.independent }
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
          assets.overlays.push({ layer: filePalette(layer.file).then(({ anchors }) => ({ ...layer, palette: anchors })), source: file })
          files.push(file)
          continue
        }
        const entry = list.value.overlays[layer.overlay]
        if (!entry || entry.layers && assets.band !== null && !entry.layers.includes(assets.band)) continue
        if (entry.generated) {
          assets.overlays.push({ layer: { ...layer, palette: definitionPalette(entry) }, source: { generated: entry.generated } })
          assets.densities.push(1)
        } else {
          assets.overlays.push({ layer: { ...layer, palette: definitionPalette(entry) }, source: sheetImage(`overlays/${layer.overlay}.png`) })
          assets.densities.push(entry.density ?? 1)
        }
      }
      const keys = ["shape", "base", "tile", "fontOverlay"].filter(key => key in assets)
      const [loaded, overlays, sizes] = await Promise.all([Promise.all(keys.map(key => assets[key])), Promise.all(assets.overlays.map(async ({ layer, source }) => ({ layer: await layer, source: await source }))), Promise.all(files)])
      const fromFont = new Set(["shape", "fontOverlay"].concat(value.source === "texture" ? ["base"] : []))
      for (const [index, key] of keys.entries()) assets[key] = fromFont.has(key) ? bandOf(loaded[index], band, font.value) : loaded[index]
      assets.overlays = overlays.map(({ layer, source }) => source.generated ? { layer, source } : { layer, source: bandOf(source, band, font.value) })
      for (const file of sizes) assets.densities.push(bandOf(file, band, font.value).width / sheet.value.width)
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
        painted.value = { font: values[0].font, ...layers[0], layers: font.value.layers ? layers : null }
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
      if (line?.source === source && line.key === key) return line
      line = { source, key, laid: arcLayout(source, sheet.value, list, word, options) }
      return line
    }

    function sweepPaints() {
      for (const key of paintCache.keys()) if (!paintUsed.has(key) && !paintKept.has(key)) paintCache.delete(key)
      paintKept = paintUsed
      paintUsed = new Set()
    }

    function remembered(key, make, sharp) {
      paintUsed.add(key)
      if (paintCache.has(key)) return paintCache.get(key)
      const made = make()
      if (!sharp) paintCache.set(key, made)
      return made
    }

    function painter(source, sharp = false) {
      const final = finalShadowed.value
      const layers = painted.value.layers ?? [painted.value]
      const id = idOf(painted.value)
      function paintPage(page) {
        const index = layers.length > 1 ? page.layer : 0
        const layer = layers[index]
        const { look, assets } = layer
        const pageKey = paintKey(page, assets, look)
        const own = remembered(JSON.stringify(["page", id, index, final, pageKey, sharp]), () => ({ page }), sharp).page
        const remapped = arcAssets(assets, own, sheet.value)
        const base = remembered(JSON.stringify(["base", id, index, lookKey(BASE.map(name => look[name])), pageKey, sharp]), () => paintBase(own, look, remapped, source.capHeight), sharp)
        return remembered(JSON.stringify(["paint", id, index, final, pageKey, sharp]), () => ({ ...painted.value, ...layer, ...paintSheet(own, look, remapped, source.capHeight, base) }), sharp)
      }
      return layouts => {
        const run = () => layouts.map(pages => pages.map(paintPage))
        if (final) return withFinalShadows(run)
        return sharp ? run() : withDraftShadows(run)
      }
    }

    function layerOptions() {
      return painted.value.layers ? layerFaces.value.map(options => ({ options })) : null
    }

    function smoothDetail(base, smooth) {
      return smooth ? base * Math.ceil(MAX_DETAIL / base) : base
    }

    function regionDetails(options) {
      const depth = faceDepth(options.depth)
      return (painted.value.layers ?? [painted.value]).map(({ look, assets }, layer) => {
        const faces = painted.value.layers ? faceOptions(targets.value[layer]) : options
        const smooth = assets.overlays.filter(({ layer, source }) => (SMOOTH_KINDS.has(source.generated) || FADE_KINDS.has(source.generated)) && layer.opacity > 0)
        const edgeFaded = assets.edgeOverlays.some(({ layer, generated }) => FADE_KINDS.has(generated) && layer.opacity > 0)
        const strip = look.source === "strip" ? stripDetail(assets.strip, depth) : 1
        const base = Number.isFinite(strip) ? strip : MAX_DETAIL
        const edgeGradient = look.customEdge && look.edgeFill === "gradient"
        const sideWrapped = smooth.some(({ layer }) => layer.sideWrap)
        const cracked = smooth.some(({ source }) => WRAPPED_KINDS.has(source.generated))
        return {
          front: smoothDetail(1, look.source === "gradient" || smooth.length > 0),
          edge: { along: smoothDetail(base, look.source === "gradient" || edgeGradient || cracked || smooth.some(({ layer }) => layer.edgeWrap)), deep: smoothDetail(base, cracked || edgeFaded) },
          internal: { along: smoothDetail(1, faces.internalFaces && (sideWrapped || (faces.customInternal ? faces.internalFill === "gradient" && faces.internalDirection !== "up" : edgeGradient))), deep: 1 },
          side: { along: smoothDetail(1, faces.sideFaces && (sideWrapped || faces.customSide && faces.sideFill === "gradient" && faces.sideDirection !== "along")), deep: 1 }
        }
      })
    }

    function shadowed() {
      return (painted.value.layers ?? [painted.value]).some(({ assets }) => assets.overlays.some(({ layer, source }) => source.generated === "shadow" && layer.opacity > 0))
    }

    function sharpened(text, source) {
      const sharp = text.refine(painter(source, true))
      sweepPaints()
      return { ...text, ...sharp, refine: null }
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

    function previewFor(source, options, placed, sheet) {
      const key = JSON.stringify([placed.map(item => [item.glyph.char, item.glyph.width, item.x, item.spaces]), ownDepth.value, Object.entries(options).filter(([name]) => !LAYOUT.has(name))])
      const final = finalShadowed.value
      if (shown?.source === source && shown.sheet === sheet && shown.painted === painted.value && shown.final === final && shown.key === key) return shown.value
      const value = buildText(source, { ...options, twist: null, depth: ownDepth.value, placed, sheet, paint: painter(source), layers: layerOptions(), textureLimit: textureLimit() })
      shown = { source, sheet, painted: painted.value, final, key, value }
      return value
    }

    function rebuild() {
      if (!font.value || painted.value?.font !== font.value.id) return
      const { words: list, word, lineDepth, ...options } = inputs.value
      const source = shaped.value?.id === font.value.id ? shaped.value : font.value
      const inputsKey = JSON.stringify([inputs.value, layerFaces.value])
      if (builtFrom?.painted === painted.value && builtFrom.source === source && builtFrom.inputsKey === inputsKey && builtFrom.final === finalShadowed.value) return
      builtFrom = { painted: painted.value, source, inputsKey, final: finalShadowed.value }
      let reach = null
      try {
        const { laid } = lineFor(source, list, word, options)
        reach = laid?.reach ?? NO_ARC
        if (!laid) {
          built.value = null
          preview.value = null
          buildError.value = null
          sharpen(null)
          return
        }
        built.value = buildText(source, { ...options, lineDepth, placed: laid.placed, line: laid.line, ends: laid.ends, sheet: laid.sheet, paint: painter(source), layers: layerOptions(), details: regionDetails(options), redraw: !finalShadowed.value && shadowed(), textureLimit: textureLimit() })
        reach = twistedReach(built.value, laid.reach)
        const thumbnail = view.previews === false ? [] : thumbnailItems(source, laid.placed)
        preview.value = thumbnail.length ? previewFor(source, options, thumbnail, laid.sheet) : null
        sweepPaints()
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
          if (object.textureSource === "premade") setTexture(object, values, { before: list.value, after: textures })
          else Object.assign(object, values)
          object.overlays = object.overlays.filter(layer => layer.source === "file" || textures.overlays[layer.overlay])
          object.spacing = defaultSpacing(object.type, loaded)
          object.depth = defaultDepth(loaded)
          object.border = defaultBorder(object.type, loaded)
          object.wordDepth = null
          object.wordBorder = null
          const faces = fontFaces(object.type, loaded)
          if (!sameValue(faces, loadedFaces.get(object) ?? fontFaces(object.type, null))) applyFontFaces(object, faces)
        })
      } else if (object.texture === null) quietly(() => (object.texture = defaultTexture(textures, object.type)))
      if (object.textureVariant && !textures.textures[object.texture]?.variants?.[object.textureVariant]) quietly(() => (object.textureVariant = null))
      if (loaded.mesh && object.textureSource === "custom") quietly(() => setTexture(object, { textureSource: "premade" }))
      quietly(() => separateForDefaults(object, textures))
      keepTexture.delete(object)
      loadedFont.set(object, loaded.id)
      loadedFaces.set(object, fontFaces(object.type, loaded))
      font.value = loaded
      sheet.value = layout
      list.value = textures
      fontError.value = null
      await repaint()
    }

    watch(looks, repaint)
    watch([inputs, painted, layerFaces], schedule)
    watch(finalShadowed, () => {
      sharp.value = false
      schedule()
    }, { flush: "sync" })
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
