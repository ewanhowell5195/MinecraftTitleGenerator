<script setup>
  import { computed, watch } from "vue"
  import ColourPicker from "../../components/ColourPicker.vue"
  import Dropdown from "../../components/Dropdown.vue"
  import Field from "../../components/Field.vue"
  import { fontFolder, fullName } from "../../lib/font.js"
  import { popular } from "../../lib/stats.js"
  import { fontOwners } from "../../lib/submissionKinds/fontAsset.js"
  import { SUBMISSION_LIMITS, pngProblem, pngSize } from "../../lib/submissions.js"
  import { fontThumbnail } from "../../lib/ui.js"
  import { detectFont } from "./detectFont.js"

  const DEFAULT_FONT = "minecraft-ten"

  defineOptions({ inheritAttrs: false })

  const props = defineProps({
    fonts: { type: Array, required: true },
    kind: { type: String, required: true },
    target: { type: String, default: "" },
    details: { type: Object, required: true },
    file: { type: Object, default: null },
    problems: { type: Object, required: true },
    tried: { type: Boolean, default: false }
  })

  const emit = defineEmits(["update:target", "update:details", "problem"])

  const owners = computed(() => fontOwners(props.fonts))
  const options = computed(() => popular(owners.value, font => font.id, font => fullName(font, props.fonts), [DEFAULT_FONT]).map(font => ({ value: font.id, label: fullName(font, props.fonts), image: fontThumbnail(props.fonts, font.id) })))
  const entry = computed(() => props.fonts.find(font => font.id === props.target))
  const template = computed(() => entry.value ? `/${fontFolder(entry.value)}/textures/flat.png` : null)
  const noun = computed(() => props.kind === "overlay" ? "overlay" : "texture")
  const border = computed({
    get: () => props.details.border ?? "#000000",
    set: value => emit("update:details", { ...props.details, border: value })
  })
  const font = computed({
    get: () => props.target,
    set: value => emit("update:target", value)
  })

  watch(() => [props.kind, props.target], () => {
    if (!owners.value.some(item => item.id === props.target)) emit("update:target", owners.value.find(item => item.id === DEFAULT_FONT)?.id ?? owners.value[0]?.id ?? "")
    if (props.kind === "texture" && !props.details.border) emit("update:details", { ...props.details, border: "#000000" })
  }, { immediate: true })

  watch(() => props.file, async file => {
    emit("problem", null)
    if (!file?.bytes || pngProblem(file.bytes, noun.value)) return
    const size = pngSize(file.bytes)
    const found = await detectFont(props.kind, file.blob, size, owners.value)
    if (file !== props.file) return
    if (found) emit("update:target", found.id)
    else emit("problem", `This ${noun.value} doesn't match any font's template. Paint over the template of the font it's for, at its size or a whole number of times bigger. This one is ${size.width}x${size.height}.`)
  })
</script>

<template>
  <Field group label="Font" :error="tried ? problems.target : ''">
    <Dropdown v-model="font" :options="options" searchable />
    <template #hint>Paint over the font's <a v-if="template" :href="template" :download="`${target}-template.png`">template</a>. It can be the same size or a whole number of times bigger, up to {{ SUBMISSION_LIMITS.side }} pixels on each side.</template>
  </Field>
  <Field group v-if="kind === 'texture'" label="Border colour" :error="problems.border">
    <ColourPicker v-model="border" />
  </Field>
</template>
