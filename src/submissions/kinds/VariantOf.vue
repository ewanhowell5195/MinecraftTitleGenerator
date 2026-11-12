<script setup>
  import { computed, ref, watch } from "vue"
  import Dropdown from "../../components/Dropdown.vue"
  import Field from "../../components/Field.vue"
  import Segments from "../../components/Segments.vue"
  import { fetched } from "../../lib/api.js"
  import { textureName } from "../../lib/submissionKinds/fontAsset.js"

  defineOptions({ inheritAttrs: false })

  const props = defineProps({
    details: { type: Object, required: true },
    noun: { type: String, required: true },
    list: { type: String, default: null },
    folder: { type: String, default: null },
    problem: { type: String, default: "" }
  })

  const emit = defineEmits(["update:details"])

  const modes = computed(() => [{ value: "new", label: `A new ${props.noun}` }, { value: "variant", label: "A variant" }])
  const textures = ref(null)
  const loadError = ref("")
  const variant = ref(!!props.details.variantOf)
  const parents = computed(() => Object.entries(textures.value ?? {}).filter(([, data]) => (data.type === "strip") === (props.noun === "strip")).map(([id, data]) => ({ value: id, label: textureName(id, data), hint: data.category, ...(props.folder && { image: `/${props.folder}/thumbnails/${id}.png` }) })).sort((a, b) => a.label.localeCompare(b.label)))
  const mode = computed({
    get: () => variant.value ? "variant" : "new",
    set(value) {
      variant.value = value === "variant"
      pickParent()
    }
  })
  const parent = computed({
    get: () => props.details.variantOf ?? "",
    set: value => emit("update:details", { ...props.details, variantOf: value })
  })

  function pickParent() {
    const { variantOf, ...rest } = props.details
    if (textures.value && !parents.value.length) variant.value = false
    const kept = variant.value ? parents.value.find(item => item.value === variantOf)?.value ?? parents.value[0]?.value : undefined
    if (kept !== variantOf) emit("update:details", kept ? { ...rest, variantOf: kept } : rest)
  }

  watch(() => props.list, async url => {
    textures.value = null
    loadError.value = ""
    if (!url) return
    try {
      const loaded = await (await fetched(url, `the ${props.noun}s`)).json()
      if (url !== props.list) return
      textures.value = loaded.textures ?? {}
      pickParent()
    } catch (err) {
      if (url === props.list) loadError.value = err.message
    }
  }, { immediate: true })

  watch(() => props.details.variantOf, value => {
    if (value) variant.value = true
  })
</script>

<template>
  <Segments label="Add it as" v-model="mode" :options="modes" />
  <Field group v-if="variant" :label="parents.length ? 'Variant of' : ''" :error="loadError || problem" :hint="`Variants are listed under the ${noun} they belong to, like a different colour of it.`">
    <Dropdown v-if="parents.length" v-model="parent" :options="parents" searchable />
  </Field>
</template>
