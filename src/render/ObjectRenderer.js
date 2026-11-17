import { computed, onBeforeUnmount, shallowRef, watch } from "vue"
import { fontTextures, preload, shapeFont, sheetFor } from "../lib/texture/assets.js"
import { arcAssets, arcLayout } from "../lib/geometry/arc.js"
import { buildOutline, buildText } from "../lib/geometry/build.js"
import { textureLimit } from "../lib/texture/canvas.js"
import { customFontEntry, customFontId } from "../lib/font/customFonts.js"
import { EulaDeclined } from "../lib/minecraft/eula.js"
import { withDraftShadows, withFinalShadows } from "../lib/texture/overlays/shadows.js"
import { CUSTOM_SHAPE, SILHOUETTE_TEXT, shapeOf } from "../lib/geometry/shapes.js"
import { hasMarks, loadFont, sheetFolder } from "../lib/font/font.js"
import { thumbnailItems } from "../lib/geometry/layout.js"
import { setHeights, usePlacement, usePublished } from "./objectState.js"
import { faceOptions, lookOf } from "./objectLook.js"
import { loadAssets, paintedLayer } from "./objectAssets.js"
import { createPaintCache } from "./paintCache.js"
import { regionDetails } from "./regionDetails.js"
import { applyFontDefaults } from "./fontDefaults.js"
import { baseKey, idOf, lookKey, paintKey } from "../lib/texture/paint/keys.js"
import { paintBase, paintSheet } from "../lib/texture/paint/sheet.js"
import { bakeCover, bakesAside, coverBases, coverShading } from "../lib/texture/paint/coverBake.js"
import { MAX_DETAIL } from "../lib/texture/atlas/scales.js"
import { cameraCover, coverProjection } from "./coverProjection.js"
import { hueMatrix } from "./coverMaterial.js"
import { platform } from "../lib/core/platform.js"
import { quietly } from "../lib/state/history.js"
import { userBusy } from "../lib/state/activity.js"
import { DEFAULT_CAP_HEIGHT, DEFAULT_HEIGHT, NO_ARC } from "../lib/geometry/rows.js"
import { editorTitle, finalShadows, words } from "../lib/state/scene.js"
import { defaultDepth } from "../lib/settings/defaults.js"
import { isSeparate, layerTarget } from "../lib/settings/layers.js"
import { effectiveScale, isCustomFont } from "../lib/settings/settings.js"

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
    const baking = shallowRef(0)
    const shading = shallowRef(null)
    const bakes = new WeakMap()
    const error = computed(() => fontError.value ?? paintError.value ?? buildError.value)
    const finalShadowed = computed(() => finalShadows.value && !!painted.value && shadowed())
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
    let waitingSharp = null
    let gone = false
    let drafted = null
    let shadingFrom = null
    const { sweepPaints, remembered } = createPaintCache()

    const layerCount = computed(() => font.value?.layers?.length ?? 1)
    const targets = computed(() => Array.from({ length: layerCount.value }, (_, layer) => layerTarget(object, layer)))
    const looks = computed(() => targets.value.map((target, layer) => lookOf(target, isSeparate(object, "overlays") ? layer : 0, font.value, list.value)))

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

    function size() {
      return { height: font.value?.height ?? DEFAULT_HEIGHT, capHeight: font.value?.capHeight ?? DEFAULT_CAP_HEIGHT }
    }

    const { transform, outlineOf, haloOf } = usePlacement(object, props.title, { scale: meshScale, wordScale, measures: () => ({ ...size(), depth: depth.value, reference: typeDepth(defaultDepth(font.value)) }) })
    const outline = outlineOf(built, buildOutline)
    const coverKey = computed(() => {
      if (!cameraCover(object)) return null
      const projection = coverProjection(object, props.title, props.title.runtime[object.id]?.built ?? null, transform.value)
      return projection && JSON.stringify(projection)
    })
    const previewOutline = outlineOf(preview, buildOutline)
    const halo = haloOf(built, buildOutline)

    async function paint() {
      const values = looks.value
      const key = lookKey(values)
      if (key === paintedKey) return
      const token = ++paintRequest
      const sources = { font: font.value, list: list.value, sheet: sheet.value, tileables: props.tileables }
      try {
        const loaded = await Promise.all(values.map((value, layer) => loadAssets(sources, value, layer, targets.value[layer])))
        if (token !== paintRequest) return
        const [assets] = loaded
        shaped.value = assets.base && !sources.font.mesh && !sources.font.layers ? shapeFont(sources.font, sources.sheet, assets.base) : sources.font
        const layers = values.map((value, layer) => paintedLayer(value, loaded[layer]))
        painted.value = { font: values[0].font, ...layers[0], layers: sources.font.layers ? layers : null }
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

    function painter(source, sharp = false, cover = null) {
      const final = finalShadowed.value
      const layers = painted.value.layers ?? [painted.value]
      const id = idOf(painted.value)
      function paintPage(page, number) {
        const index = layers.length > 1 ? page.layer : 0
        const layer = layers[index]
        const { look, assets } = layer
        const pageKey = paintKey(page, assets, look)
        const baked = cover?.fill ?? cover?.bases[number] ?? null
        const tag = baked ? cover.key : null
        const own = remembered(JSON.stringify(["page", id, index, final, pageKey, sharp]), () => ({ page }), sharp).page
        const remapped = { ...arcAssets(assets, own, sheet.value), ...(baked && { coverBase: baked }) }
        const base = remembered(JSON.stringify(["base", index, baseKey(look, assets), idOf(sheet.value), source.capHeight, pageKey, sharp, tag]), () => paintBase(own, look, remapped, source.capHeight), sharp)
        return remembered(JSON.stringify(["paint", id, index, final, pageKey, sharp, tag]), () => ({ ...painted.value, ...layer, ...paintSheet(own, look, remapped, source.capHeight, base) }), sharp)
      }
      return layouts => {
        let number = 0
        const run = () => layouts.map(pages => pages.map(page => paintPage(page, number++)))
        if (final) return withFinalShadows(run)
        return sharp ? run() : withDraftShadows(run)
      }
    }

    function layerOptions() {
      return painted.value.layers ? layerFaces.value.map(options => ({ options })) : null
    }

    function faded() {
      return (painted.value.layers ?? [painted.value]).map(({ look }) => !!look.fade)
    }

    function shadowed() {
      return (painted.value.layers ?? [painted.value]).some(({ assets }) => assets.overlays.some(({ layer, source }) => source.generated === "shadow" && layer.opacity > 0))
    }

    function coverFor(text) {
      if (!cameraCover(object) || !text || !painted.value.assets.cover) return null
      const projection = coverProjection(object, props.title, text, transform.value)
      return projection && { projection, key: JSON.stringify(projection) }
    }

    function bakeDone() {
      if (gone) return
      schedule()
      const waited = waitingSharp
      if (waited && built.value === waited.text) sharpen(waited.text, waited.source, 0)
    }

    function startBake(geometry, state) {
      const cover = state.wanted
      state.wanted = null
      state.inflight = cover.key
      baking.value++
      bakeCover(geometry, cover.projection, painted.value.assets.cover).then(bases => {
        state.key = cover.key
        state.bases = bases
      }, err => {
        buildError.value = err.message
      }).finally(() => {
        state.inflight = null
        baking.value--
        if (state.wanted && state.wanted.key !== state.key) startBake(geometry, state)
        else bakeDone()
      })
    }

    function bakedBases(geometry, cover) {
      if (!bakes.has(geometry)) bakes.set(geometry, { key: null, bases: null, inflight: null, wanted: null })
      const state = bakes.get(geometry)
      if (state.key === cover.key) return state.bases
      if (view.eager || !bakesAside()) {
        state.key = cover.key
        state.bases = coverBases(geometry, cover.projection, painted.value.assets.cover)
        return state.bases
      }
      state.wanted = cover
      if (!state.inflight) startBake(geometry, state)
      return null
    }

    function coverPainter(source, sharp, cover, bases) {
      return painter(source, sharp, { key: cover.key, bases })
    }

    function shaded(first, source) {
      if (first.shaded) return first.shaded
      const layers = painted.value.layers ?? [painted.value]
      const [dark, light] = ["#000000", "#ffffff"].map(fill => first.repaint(painter(source, false, { key: fill, fill })))
      first.shaded = { ...first, pages: dark.pages, swatch: dark.swatch, averages: { side: null, edge: null }, first, shader: { light: light.pages.map(page => page.texture), hues: dark.pages.map(page => hueMatrix(layers[layers.length > 1 ? page.layer : 0].look)) } }
      return first.shaded
    }

    function shadeWith(first, cover) {
      shadingFrom = { first, cover }
      shading.value = { ...coverShading(first, cover.projection, painted.value.assets.cover, MAX_DETAIL, levelReady), matrix: cover.projection.matrix, detail: MAX_DETAIL }
    }

    function levelReady() {
      if (!gone && shadingFrom && built.value?.shader) shadeWith(shadingFrom.first, shadingFrom.cover)
    }

    function shadedSharp(text, source) {
      const cover = coverFor(text.first)
      if (!cover) return null
      const draft = text.first.sharp ??= text.first.refine(null)
      const bases = bakedBases(draft, cover)
      if (!bases) {
        waitingSharp = { text, source }
        return null
      }
      const sharp = text.first.refine(coverPainter(source, true, cover, bases))
      sweepPaints()
      return { ...text.first, ...sharp, refine: null, cover, first: text.first }
    }

    function sharpened(text, source) {
      if (text.shader) return shadedSharp(text, source)
      if (!text.cover) {
        const draft = text.refine(painter(source, true))
        sweepPaints()
        return { ...text, ...draft, refine: null }
      }
      const draft = text.first.sharp ??= text.first.refine(null)
      const bases = bakedBases(draft, text.cover)
      if (!bases) {
        waitingSharp = { text, source }
        return null
      }
      const sharp = text.refine(coverPainter(source, true, text.cover, bases))
      sweepPaints()
      return { ...text, ...sharp, refine: null }
    }

    function sharpen(text, source, delay = SHARPEN_DELAY) {
      clearTimeout(sharpening)
      waitingSharp = null
      sharp.value = !text?.refine
      if (sharp.value) return
      if (view.eager) {
        built.value = sharpened(text, source)
        sharp.value = true
        return
      }
      function attempt() {
        if (built.value !== text) return
        if (userBusy()) {
          sharpening = setTimeout(attempt, SHARPEN_DELAY)
          return
        }
        try {
          const next = sharpened(text, source)
          if (!next) return
          built.value = next
        } catch (err) {
          buildError.value = err.message
        }
        sharp.value = true
      }
      sharpening = setTimeout(attempt, delay)
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
      const key = JSON.stringify([placed.map(item => [item.glyph.char, item.glyph.width, item.x, item.spaces]), ownDepth.value, Object.entries(options).filter(([name]) => !LAYOUT.has(name)), layerFaces.value])
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
      if (builtFrom?.painted === painted.value && builtFrom.source === source && builtFrom.inputsKey === inputsKey && builtFrom.final === finalShadowed.value && builtFrom.cover === coverKey.value) return
      builtFrom = { painted: painted.value, source, inputsKey, final: finalShadowed.value, cover: coverKey.value }
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
        const settings = { ...options, lineDepth, placed: laid.placed, line: laid.line, ends: laid.ends, sheet: laid.sheet, layers: layerOptions(), details: regionDetails(painted.value, targets.value, options), redraw: !finalShadowed.value && shadowed(), textureLimit: textureLimit() }
        const firstKey = [builtFrom.painted, source, inputsKey, builtFrom.final]
        if (!drafted || drafted.key.some((part, at) => part !== firstKey[at])) drafted = { key: firstKey, value: buildText(source, cameraCover(object) ? { ...settings, paint: null, faded: faded() } : { ...settings, paint: painter(source) }) }
        const first = drafted.value
        const cover = coverFor(first)
        if (cover && !view.eager && bakesAside()) {
          built.value = shaded(first, source)
          shadeWith(first, cover)
        } else {
          shading.value = null
          built.value = cover ? { ...buildText(source, { ...settings, paint: coverPainter(source, false, cover, bakedBases(first, cover)) }), cover, first } : cameraCover(object) ? buildText(source, { ...settings, paint: painter(source) }) : first
        }
        builtFrom.cover = cover?.key ?? null
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
      applyFontDefaults(object, loaded, textures, list.value)
      font.value = loaded
      sheet.value = layout
      list.value = textures
      fontError.value = null
      await repaint()
    }

    watch(looks, repaint)
    watch([inputs, painted, layerFaces, coverKey], schedule)
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
      entry: () => ({ font: font.value, list: list.value, built: built.value, cover: shading.value, error: error.value, transform: transform.value, outline: outline.value, halo: halo.value, preview: preview.value && { built: preview.value, outline: previewOutline.value }, settled: painted.value?.font === wanted.value && !baking.value || !!error.value, sharp: sharp.value })
    })

    onBeforeUnmount(() => {
      gone = true
      platform.cancelFrame(frame)
      clearTimeout(sharpening)
    })

    return () => null
  }
}
