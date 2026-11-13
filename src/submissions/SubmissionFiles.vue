<script setup>
  import Notice from "../components/Notice.vue"
  import { onBeforeUnmount, ref, watch } from "vue"
  import { fetched } from "../lib/api.js"
  import { SUBMISSION_KINDS } from "../lib/submissionKinds/index.js"
  import { submissionExtraUrl, submissionFileUrl } from "../lib/submissionsApi.js"

  const EXTRA_LABELS = { flat: "Flat texture", texture: "Texture", overlay: "Overlay", strip: "Strip" }

  const props = defineProps({
    item: { type: Object, required: true }
  })

  const files = ref([])
  const sizes = ref({})
  const problem = ref("")
  const made = []

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

  async function load() {
    forget()
    problem.value = ""
    const item = props.item
    const own = SUBMISSION_KINDS[item.kind].accept === "image/png" ? [{ key: "file", name: item.name, label: SUBMISSION_KINDS[item.kind].label, url: submissionFileUrl(item) }] : []
    const texture = item.kind === "shapeModel" ? [{ key: "texture", name: "Texture", label: "Texture", url: submissionExtraUrl(item, "texture") }] : []
    const extras = texture.concat((item.details.extras ?? []).map(extra => ({ key: extra.key, name: extra.name || extra.key, label: EXTRA_LABELS[extra.kind], url: submissionExtraUrl(item, extra.key) }))).filter(file => file.url)
    files.value = own.concat(extras)
    if (item.kind !== "font") return
    try {
      files.value = (await fontSheet()).concat(files.value)
    } catch (err) {
      problem.value = `The font sheet couldn't be read: ${err.message}`
    }
  }

  function measured(key, event) {
    sizes.value = { ...sizes.value, [key]: `${event.target.naturalWidth}x${event.target.naturalHeight}` }
  }

  watch(() => [props.item.id, props.item.file], load, { immediate: true })
  onBeforeUnmount(forget)
</script>

<template>
  <div class="files">
    <p v-if="files.length === 0 && !problem" class="hint">No files.</p>
    <Notice v-if="problem">{{ problem }}</Notice>
    <figure v-for="file of files" :key="file.key" class="file">
      <figcaption>
        <strong>{{ file.name }}</strong>
        <span class="hint">{{ file.label }}<template v-if="sizes[file.key]">, {{ sizes[file.key] }}</template></span>
        <a class="hint" :href="file.url" target="_blank" rel="noopener">Open full size</a>
      </figcaption>
      <div class="sheet"><img :src="file.url" :alt="file.name" @load="measured(file.key, $event)"></div>
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

  .sheet {
    display: flex;
    justify-content: center;
    overflow: auto;
    background: var(--checker);
  }

  .sheet img {
    max-width: 100%;
    min-width: min(100%, 512px);
    height: auto;
    image-rendering: pixelated;
  }
</style>
