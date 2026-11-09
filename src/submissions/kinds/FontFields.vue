<script setup>
  import { computed, onBeforeUnmount, ref, watch } from "vue"
  import ColourPicker from "../../components/ColourPicker.vue"
  import Dropdown from "../../components/Dropdown.vue"
  import Icon from "../../components/Icon.vue"
  import Segments from "../../components/Segments.vue"
  import { fullName } from "../../lib/font.js"
  import { flatTexture, slug } from "../../lib/fontEditor.js"
  import { popular } from "../../lib/stats.js"
  import { EXTRA_KINDS, FONT_ID_LENGTH, fontParents, stripHeightsFor } from "../../lib/submissionKinds/font.js"
  import { ownFont, submittedFont } from "../../lib/submissionKinds/fontBuild.js"
  import { SUBMISSION_LIMITS } from "../../lib/submissions.js"
  import { submissionExtraUrl } from "../../lib/submissionsApi.js"
  import { fontThumbnail } from "../../lib/ui.js"
  import { pngUrl } from "../../lib/virtualFiles.js"

  const DEFAULT_PARENT = "minecraft-ten"
  const NEW_EXAMPLES = ["f8thful", "block-serif", "minecraft-earth"]
  const MODES = [{ value: "new", label: "A new font" }, { value: "variant", label: "A variant" }]
  const KIND_LABELS = { texture: "Texture", overlay: "Overlay", strip: "Strip" }

  const props = defineProps({
    fonts: { type: Array, required: true },
    kind: { type: String, required: true },
    target: { type: String, default: "" },
    details: { type: Object, required: true },
    files: { type: Object, default: () => ({}) },
    file: { type: Object, default: null },
    initial: { type: Object, default: null },
    name: { type: String, default: "" },
    problems: { type: Object, required: true },
    tried: { type: Boolean, default: false }
  })

  const emit = defineEmits(["update:target", "update:details", "update:files", "problem"])

  const variant = ref(!!props.target)
  let lastParent = props.target || DEFAULT_PARENT
  let autoId = ""

  const parents = computed(() => popular(fontParents(props.fonts), font => font.id, font => font.name, [DEFAULT_PARENT]).map(font => ({ value: font.id, label: font.name, image: fontThumbnail(props.fonts, font.id) })))
  const parentEntry = computed(() => props.fonts.find(font => font.id === props.target && !font.variant))
  const parentName = computed(() => parentEntry.value?.name ?? "the font")
  const inherits = computed(() => !!props.target && !!props.details.inherits)
  const extras = computed(() => Array.isArray(props.details.extras) ? props.details.extras : [])
  const newExamples = computed(() => NEW_EXAMPLES.map(id => props.fonts.find(font => font.id === id && !font.variant)?.name).filter(Boolean))
  const sharedExamples = computed(() => props.fonts.filter(font => font.inherits).map(font => fullName(font, props.fonts)))
  const ownExamples = computed(() => props.fonts.filter(font => font.variant && !font.inherits).map(font => fullName(font, props.fonts)))

  const mode = computed({
    get: () => variant.value ? "variant" : "new",
    set(value) {
      variant.value = value === "variant"
      emit("update:target", variant.value ? lastParent : "")
    }
  })
  const parent = computed({
    get: () => props.target,
    set(value) {
      lastParent = value
      emit("update:target", value)
    }
  })
  const id = computed({
    get: () => props.details.id ?? "",
    set: value => emit("update:details", { ...props.details, id: value.toLowerCase() })
  })

  const built = computed(() => {
    if (!props.file?.bytes || inherits.value) return null
    try {
      return ownFont(submittedFont(props.file.bytes).font, props.target || null)
    } catch {
      return null
    }
  })
  const blankTexture = computed(() => {
    if (!built.value) return null
    try {
      return pngUrl(flatTexture(submittedFont(props.file.bytes).font))
    } catch {
      return null
    }
  })
  const stripHeights = computed(() => {
    const rows = built.value?.template.rows ?? props.details.template?.rows
    return rows ? stripHeightsFor(rows) : null
  })

  function joined(list) {
    return list.length > 1 ? `${list.slice(0, -1).join(", ")} and ${list.at(-1)}` : list[0]
  }

  function either(list) {
    return list.length > 1 ? `${list.slice(0, -1).join(", ")} or ${list.at(-1)}` : String(list[0])
  }

  function fileName() {
    if (!props.file?.bytes) return ""
    try {
      const json = JSON.parse(new TextDecoder().decode(props.file.bytes))
      return slug(json.name ?? "") || slug(json.id ?? "")
    } catch {
      return ""
    }
  }

  function suggestId(value) {
    const next = value.slice(0, FONT_ID_LENGTH).replace(/-+$/, "")
    if (!next) return
    if (!props.details.id || props.details.id === autoId) emit("update:details", { ...props.details, id: next })
    autoId = next
  }

  watch(() => props.target, target => {
    if (target) variant.value = true
  })

  watch(() => props.name, value => suggestId(slug(value)))
  watch(() => props.file, () => suggestId(slug(props.name) || fileName()), { immediate: true })

  function update(key, change) {
    emit("update:details", { ...props.details, extras: extras.value.map(item => item.key === key ? { ...item, ...change } : item) })
  }

  function add(kind) {
    const key = `${kind}-${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`
    emit("update:details", { ...props.details, extras: extras.value.concat({ key, kind, name: "", ...(kind !== "overlay" && { border: "#000000" }) }) })
  }

  function remove(key) {
    const files = { ...props.files }
    if (files[key]) URL.revokeObjectURL(files[key].url)
    delete files[key]
    emit("update:files", files)
    emit("update:details", { ...props.details, extras: extras.value.filter(item => item.key !== key) })
  }

  async function pick(key, event) {
    const chosen = event.target.files[0]
    event.target.value = ""
    if (!chosen) return
    const files = { ...props.files }
    if (files[key]) URL.revokeObjectURL(files[key].url)
    files[key] = { blob: chosen, bytes: new Uint8Array(await chosen.arrayBuffer()), url: URL.createObjectURL(chosen), name: chosen.name }
    emit("update:files", files)
  }

  function imageOf(key) {
    return props.files[key]?.url ?? (props.initial ? submissionExtraUrl(props.initial, key) : null)
  }

  onBeforeUnmount(() => {
    for (const file of Object.values(props.files)) URL.revokeObjectURL(file.url)
  })
</script>

<template>
  <div class="field">
    <span class="label">Add it as</span>
    <Segments v-model="mode" :options="MODES" />
    <p class="hint">Make the font in the <a href="/font-editor/" target="_blank">font editor</a> and send the JSON it downloads. A variant is another version of a font that is already here, listed under it. Anything else is a new font<template v-if="newExamples.length">, like {{ joined(newExamples) }}</template>.</p>
  </div>
  <template v-if="variant">
    <div class="field">
      <Dropdown v-if="parents.length" v-model="parent" :options="parents" label="Variant of" searchable />
      <span v-if="tried && problems.target" class="hint bad">{{ problems.target }}</span>
    </div>
    <div class="field">
      <span class="label">Kind of variant</span>
      <label class="choice" :class="{ chosen: inherits }">
        <input type="radio" :checked="inherits" @change="emit('update:details', { ...details, inherits: true })">
        <span class="choice-title">A variation of {{ parentName }}</span>
        <span class="hint">Redraws some of {{ parentName }}'s characters and uses everything else from it, including every texture. Only the characters you change are added, so draw it at the same height and square size.<template v-if="sharedExamples.length"> Like {{ joined(sharedExamples) }}.</template></span>
      </label>
      <label class="choice" :class="{ chosen: !inherits }">
        <input type="radio" :checked="!inherits" @change="emit('update:details', { ...details, inherits: false })">
        <span class="choice-title">A separate font</span>
        <span class="hint">A whole font of its own, listed under {{ parentName }} because it belongs with it, eg the same letters for another alphabet. It gets its own textures, starting with a flat one.<template v-if="ownExamples.length"> Like {{ joined(ownExamples) }}.</template></span>
      </label>
    </div>
  </template>
  <label class="field">
    <span class="label">Font id</span>
    <input type="text" v-model="id" :maxlength="FONT_ID_LENGTH" spellcheck="false" placeholder="my-font">
    <span v-if="problems.id && (tried || id)" class="hint bad">{{ problems.id }}</span>
    <span v-else class="hint">Used in links and file names. Lowercase letters, numbers and hyphens.</span>
  </label>
  <div v-if="!inherits" class="field">
    <span class="label">Textures, overlays and strips for this font</span>
    <p class="hint">Optional. Paint textures and overlays over the font's <a v-if="blankTexture" :href="blankTexture" :download="`${id || 'font'}-template.png`">blank texture</a><template v-else>blank texture, from the Textures tab of the font editor</template>, at its size or a whole number of times bigger.<template v-if="stripHeights"> Strips can be {{ either(stripHeights) }} pixels tall.</template> Up to {{ SUBMISSION_LIMITS.extraFiles }} files.</p>
    <div v-for="item of extras" :key="item.key" class="extra">
      <label class="extra-image" :title="`Choose the ${KIND_LABELS[item.kind].toLowerCase()}'s PNG`">
        <img v-if="imageOf(item.key)" :src="imageOf(item.key)" alt="">
        <span v-else class="hint">PNG</span>
        <input type="file" accept="image/png" @change="pick(item.key, $event)">
      </label>
      <div class="extra-fields">
        <div class="row">
          <span class="extra-kind">{{ KIND_LABELS[item.kind] }}</span>
          <button type="button" class="icon-button small" :aria-label="`Remove ${item.name || KIND_LABELS[item.kind].toLowerCase()}`" @click="remove(item.key)"><Icon name="trash" :size="14" /></button>
        </div>
        <input type="text" :value="item.name" :maxlength="SUBMISSION_LIMITS.name" placeholder="Name" spellcheck="false" @input="update(item.key, { name: $event.target.value })">
        <input type="text" :value="item.credit ?? ''" :maxlength="SUBMISSION_LIMITS.credit" placeholder="Credit, if it isn't the font's" spellcheck="false" @input="update(item.key, { credit: $event.target.value })">
        <div v-if="item.kind !== 'overlay'" class="row">
          <span class="hint">Border</span>
          <ColourPicker :model-value="item.border ?? '#000000'" @update:model-value="update(item.key, { border: $event })" />
        </div>
        <span v-if="problems[`extra:${item.key}`] && (tried || files[item.key])" class="hint bad">{{ problems[`extra:${item.key}`] }}</span>
      </div>
    </div>
    <span v-if="problems.extras" class="hint bad">{{ problems.extras }}</span>
    <div v-if="extras.length < SUBMISSION_LIMITS.extraFiles" class="buttons">
      <button v-for="kind of EXTRA_KINDS" :key="kind" type="button" class="small" @click="add(kind)"><Icon name="plus" :size="14" />{{ KIND_LABELS[kind] }}</button>
    </div>
  </div>
</template>

<style scoped>
  .choice {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 4px 10px;
    padding: 10px 12px;
    background: var(--card);
    border: 1px solid transparent;
    cursor: pointer;
    user-select: none;
    transition: background var(--duration), border-color var(--duration);
  }

  .choice:hover {
    background: var(--card-hover);
  }

  .choice.chosen {
    border-color: var(--accent);
    background: var(--accent-soft);
  }

  .choice input {
    grid-row: span 2;
    margin: 2px 0 0;
    accent-color: var(--accent);
  }

  .choice-title {
    font-weight: 600;
  }

  .extra {
    display: flex;
    gap: 10px;
    padding: 10px;
    background: var(--field);
  }

  .extra-image {
    display: flex;
    flex: none;
    align-items: center;
    justify-content: center;
    width: 72px;
    height: 72px;
    background: var(--checker);
    border: 2px dashed var(--line-strong);
    cursor: pointer;
    user-select: none;
  }

  .extra-image img {
    max-width: 100%;
    max-height: 100%;
    image-rendering: pixelated;
  }

  .extra-fields {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }

  .extra-kind {
    flex: 1;
    font-weight: 600;
  }

  .extra-fields input[type="text"] {
    padding: 7px 10px;
  }

  .buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
</style>
