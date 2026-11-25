<script setup>
  import Notice from "../components/Notice.vue"
  import ToggleSwitch from "../components/ToggleSwitch.vue"
  import { onBeforeUnmount, ref, watch } from "vue"
  import { fetched } from "../lib/core/api.js"
  import { pngUrl } from "../lib/core/virtualFiles.js"
  import { fontFolder } from "../lib/font/catalog.js"
  import { flatTexture } from "../lib/font/editor/export.js"
  import { loadImage } from "../lib/font/font.js"
  import { submissionFont } from "../lib/submissions/kinds/fontAsset.js"
  import { submittedFont } from "../lib/submissions/kinds/fontBuild.js"
  import { SUBMISSION_KINDS } from "../lib/submissions/kinds/index.js"
  import { submissionExtraUrl, submissionFileUrl } from "../lib/submissions/submissionsApi.js"

  const EXTRA_LABELS = { flat: "Flat texture", texture: "Texture", overlay: "Overlay", strip: "Strip" }

  const props = defineProps({
    item: { type: Object, required: true },
    fonts: { type: Array, required: true }
  })

  const files = ref([])
  const sizes = ref({})
  const layered = ref({})
  const problem = ref("")
  const made = []
  let loads = 0

  function forget() {
    for (const url of made.splice(0)) URL.revokeObjectURL(url)
  }

  async function fontSheet() {
    const json = await (await fetched(submissionFileUrl(props.item), "the font")).json()
    const texture = json.editor?.texture
    if (typeof texture !== "string") return []
    const url = URL.createObjectURL(await (await fetched(texture, "the font sheet")).blob())
    made.push(url)
    return [{ key: "sheet", name: "Font sheet", label: "Characters", url }]
  }

  async function characters() {
    if (props.item.kind !== "font") return `/${fontFolder(submissionFont(props.fonts, props.item.target))}/textures/flat.png`
    const bytes = await (await fetched(submissionFileUrl(props.item), "the font")).arrayBuffer()
    return pngUrl(flatTexture(submittedFont(new Uint8Array(bytes)).font))
  }

  async function overCharacters(file) {
    const [flat, overlay] = await Promise.all([characters().then(loadImage), loadImage(file.url)])
    const canvas = document.createElement("canvas")
    const { width, height } = overlay
    Object.assign(canvas, { width, height })
    const ctx = canvas.getContext("2d")
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(flat, 0, 0, width, height)
    ctx.globalCompositeOperation = "multiply"
    ctx.fillStyle = "#808080"
    ctx.fillRect(0, 0, width, height)
    ctx.globalCompositeOperation = "destination-in"
    ctx.drawImage(flat, 0, 0, width, height)
    ctx.globalCompositeOperation = "source-over"
    ctx.drawImage(overlay, 0, 0)
    return canvas.toDataURL("image/png")
  }

  async function toggleCharacters(file, on) {
    const token = loads
    problem.value = ""
    if (!on) return void delete layered.value[file.key]
    layered.value[file.key] = file.url
    try {
      const url = await overCharacters(file)
      if (token === loads && layered.value[file.key]) layered.value[file.key] = url
    } catch (err) {
      if (token !== loads) return
      delete layered.value[file.key]
      problem.value = `The characters couldn't be drawn: ${err.message}`
    }
  }

  async function load() {
    const token = ++loads
    forget()
    layered.value = {}
    problem.value = ""
    const item = props.item
    const own = SUBMISSION_KINDS[item.kind].accept === "image/png" ? [{ key: "file", name: item.name, label: SUBMISSION_KINDS[item.kind].label, overlay: item.kind === "overlay", url: submissionFileUrl(item) }] : []
    const texture = item.kind === "shapeModel" ? [{ key: "texture", name: "Texture", label: "Texture", url: submissionExtraUrl(item, "texture") }] : []
    const extras = texture.concat((item.details.extras ?? []).map(extra => ({ key: extra.key, name: extra.name || extra.key, label: EXTRA_LABELS[extra.kind], overlay: extra.kind === "overlay", url: submissionExtraUrl(item, extra.key) }))).filter(file => file.url)
    files.value = own.concat(extras)
    if (item.kind !== "font") return
    try {
      const sheet = await fontSheet()
      if (token === loads) files.value = sheet.concat(files.value)
    } catch (err) {
      if (token === loads) problem.value = `The font sheet couldn't be read: ${err.message}`
    }
  }

  function measured(key, event) {
    sizes.value = { ...sizes.value, [key]: `${event.target.naturalWidth}x${event.target.naturalHeight}` }
  }

  watch(() => [props.item.id, props.item.file], load, { immediate: true })
  onBeforeUnmount(forget)
</script>

<template>
  <div v-popupable-group="files.length > 1 && { counter: true }" class="files">
    <p v-if="files.length === 0 && !problem" class="hint">No files.</p>
    <Notice v-if="problem">{{ problem }}</Notice>
    <figure v-for="file of files" :key="file.key" class="file">
      <figcaption>
        <strong>{{ file.name }}</strong>
        <span class="hint">{{ file.label }}<template v-if="sizes[file.key]">, {{ sizes[file.key] }}</template></span>
        <label v-if="file.overlay" class="over">Over the characters<ToggleSwitch :model-value="!!layered[file.key]" @update:model-value="toggleCharacters(file, $event)" /></label>
        <a class="hint" :href="file.url" target="_blank" rel="noopener">Open full size</a>
      </figcaption>
      <div class="sheet"><img v-popupable="{ title: file.name, zoomable: true }" :src="layered[file.key] ?? file.url" :alt="file.name" @load="measured(file.key, $event)"></div>
    </figure>
  </div>
</template>

<style scoped>
  .files {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .file {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin: 0;
  }

  figcaption {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 4px 12px;
  }

  figcaption a {
    margin-left: auto;
  }

  .over {
    display: flex;
    align-items: center;
    align-self: center;
    gap: 8px;
    margin-left: auto;
    font-size: var(--font-sm);
    color: var(--muted);
    cursor: pointer;
    user-select: none;
  }

  .over + a {
    margin-left: 0;
  }

  .sheet {
    display: flex;
    justify-content: center;
    overflow: auto;
  }

  .sheet,
  .sheet img {
    background: var(--checker);
    background-position: center;
  }

  .sheet img {
    max-width: 100%;
    min-width: min(100%, 512px);
    height: auto;
    image-rendering: pixelated;
  }
</style>
