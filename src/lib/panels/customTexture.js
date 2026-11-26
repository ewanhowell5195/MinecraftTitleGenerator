import { computed, ref, watch } from "vue"
import { image } from "../texture/assets.js"
import { TEXTURE_TABS } from "../settings/settings.js"
import { boxOf } from "#render/bufferPoints.js"
import { cameraCover, coverMembers, coverProjection } from "#render/coverProjection.js"
import { host } from "./host.js"
import { usedTextures } from "./uploads.js"

const CUSTOM_MODES = [{ value: "standard", label: "Standard" }, { value: "tileable", label: "Tileable" }, { value: "strip", label: "Strip" }, { value: "cover", label: "Cover" }]
const SAME_SHAPE = 0.01
const ALIGNS = [{ value: "title", label: "Title" }, { value: "camera", label: "Camera" }]

function useCustomTexture(context) {
  const object = computed(() => context.object)
  const font = computed(() => context.font)
  const flatSize = ref(null)
  const customSize = ref(null)

  const modes = computed(() => font.value?.mesh ? CUSTOM_MODES.filter(mode => mode.value !== "standard") : CUSTOM_MODES)
  const fitsFont = computed(() => !customSize.value || !flatSize.value || sameShape(customSize.value, flatSize.value))
  const modeHint = computed(() => ({
    standard: fitsFont.value ? "Painted onto the letters using the same layout as this font's flat texture." : "This image isn't the shape of this font's flat texture, so it won't line up with the letters.",
    tileable: "Repeated across the letters. The tiling settings are below.",
    cover: object.value.customCoverAlign === "camera" ? "Stretched to cover the line as the camera sees it, keeping its shape. Move it to show the part you want." : "Stretched to cover each line, keeping its shape. Move it to show the part you want.",
    strip: font.value?.layers?.length > 1 ? "Read from top to bottom as the top edge, the front and the bottom edge of each layer in turn, starting with layer 1, then repeated along the line." : "Read from top to bottom as the top edge, the front and the bottom edge, then repeated along the line."
  })[object.value.customTextureMode])
  const members = computed(() => cameraCover(object.value) ? coverMembers(object.value, host.title) : [object.value])
  const sharing = computed(() => cameraCover(object.value) && host.title.objects.some(other => other !== object.value && cameraCover(other) && other.customTexture === object.value.customTexture))
  const coverBox = computed(() => {
    const state = host.title.runtime[object.value.id]
    if (!state?.built?.body.triangles) return null
    if (cameraCover(object.value)) {
      const box = coverProjection(object.value, host.title, state.built, state.transform)?.box
      return box && { width: box.maxX - box.minX, height: box.maxY - box.minY }
    }
    const { min, max } = boxOf(state.built.body)
    return { width: max.x - min.x, height: max.y - min.y }
  })
  const overflow = computed(() => {
    if (!coverBox.value || !customSize.value) return null
    const ratio = customSize.value.width / customSize.value.height
    const target = coverBox.value.width / coverBox.value.height
    return Math.abs(ratio - target) < SAME_SHAPE ? "none" : ratio > target ? "x" : "y"
  })
  const coverX = computed({
    get: () => members.value[0].customCoverX,
    set: value => {
      for (const member of members.value) member.customCoverX = value
    }
  })
  const coverY = computed({
    get: () => members.value[0].customCoverY,
    set: value => {
      for (const member of members.value) member.customCoverY = value
    }
  })
  const reusable = computed(() => usedTextures().filter(item => item.value !== object.value.customTexture).map(item => ({ ...item, image: item.value, value: item.source })))

  function sameShape(a, b) {
    return Math.abs(a.width / a.height - b.width / b.height) < SAME_SHAPE
  }

  async function pickCustom(data) {
    const target = object.value
    if (font.value.mesh) {
      target.customTexture = data
      if (target.customTextureMode === "standard") target.customTextureMode = "tileable"
      return
    }
    const [upload, flat] = await Promise.all([image(data), image(`${font.value.sheetFolder}/textures/flat.png`)])
    target.customTexture = data
    target.customTextureMode = sameShape(upload, flat) ? "standard" : "tileable"
  }

  function reuse(source) {
    for (const key of TEXTURE_TABS.custom) object.value[key] = source[key]
  }

  watch([() => object.value.customTexture, () => font.value?.sheetFolder], async ([data, folder]) => {
    customSize.value = null
    flatSize.value = null
    if (!data || !folder) return
    const [upload, flat] = await Promise.all([image(data), image(`${folder}/textures/flat.png`)])
    if (data !== object.value.customTexture) return
    customSize.value = { width: upload.width, height: upload.height }
    flatSize.value = { width: flat.width, height: flat.height }
  }, { immediate: true })

  return { coverX, coverY, fitsFont, font, modeHint, modes, object, overflow, pickCustom, reusable, reuse, sharing }
}

const uploaded = get => !!get("customTexture")
const inMode = (get, mode) => uploaded(get) && get("customTextureMode") === mode
const covering = get => inMode(get, "cover")

function position(axis, label, still) {
  return { type: "slider", id: axis, label, min: 0, max: 100, read: (get, { state }) => state[axis].value, write: (value, { state }) => (state[axis].value = value), shown: (get, { state }) => covering(get) && state.overflow.value !== still && state.overflow.value !== "none" }
}

export const CUSTOM_TEXTURE = {
  type: "group",
  setup: useCustomTexture,
  shown: get => get("textureSource") === "custom",
  controls: [
    {
      type: "upload",
      accept: "image/*",
      view: (get, { state }) => ({ label: uploaded(get) ? "Replace texture" : "Choose an image", empty: "No texture uploaded", image: get("customTexture"), clearable: uploaded(get), back: state.reusable.value.length > 0 }),
      pick: (data, { state }) => state.pickCustom(data),
      clear: ({ set }) => set("customTexture", null)
    },
    { type: "segments", key: "customTextureMode", label: "Use as", options: (get, { state }) => state.modes.value, shown: uploaded },
    { type: "hint", text: (get, { state }) => state.modeHint.value, bad: (get, { state }) => get("customTextureMode") === "standard" && !state.fitsFont.value, shown: uploaded },
    { type: "toggle", key: "customStripPerCharacter", label: "Restart on each character", hint: "Starts the strip again from the left of every character, instead of running it along the whole line.", check: true, shown: get => inMode(get, "strip") },
    { type: "segments", key: "customCoverAlign", label: "Align to", options: ALIGNS, shown: covering },
    { type: "toggle", key: "customCoverSpan", label: "Span with other lines using this image", check: true, shown: (get, { state }) => covering(get) && state.sharing.value },
    position("coverX", "Horizontal position", "y"),
    position("coverY", "Vertical position", "x"),
    { type: "hint", text: "An image is tiled across the letters, or you can use it as a strip or stretch it over the line.", shown: (get, { font }) => !uploaded(get) && !!font?.mesh },
    { type: "hint", text: "An image the shape of this font's flat texture is painted onto the letters. Anything else is tiled, or you can use it as a strip or stretch it over the line.", shown: (get, { font }) => !uploaded(get) && !font?.mesh },
    { type: "reuse", items: (get, { state }) => state.reusable.value, pick: (value, { state }) => state.reuse(value) }
  ]
}
