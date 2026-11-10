<script setup>
  import { computed, onMounted, ref, watch } from "vue"
  import Dropdown from "../../components/Dropdown.vue"
  import Field from "../../components/Field.vue"
  import Segments from "../../components/Segments.vue"
  import { TILEABLES_LIST, TILEABLE_SIDES, seeThrough, tileableName } from "../../lib/submissionKinds/tileable.js"
  import { pngProblem } from "../../lib/submissions.js"

  const MODES = [{ value: "new", label: "A new tileable" }, { value: "variant", label: "A variant" }]

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

  const list = ref(null)
  const loadError = ref("")
  const variant = ref(!!props.target)
  let lastParent = props.target

  const sizes = TILEABLE_SIDES.map(side => `${side}x${side}`)
  const parents = computed(() => Object.entries(list.value ?? {}).map(([id, data]) => ({ value: id, label: tileableName(id, data), hint: data.category })).sort((a, b) => a.label.localeCompare(b.label)))
  const mode = computed({
    get: () => variant.value ? "variant" : "new",
    set(value) {
      variant.value = value === "variant"
      emit("update:target", variant.value ? lastParent || parents.value[0]?.value || "" : "")
    }
  })
  const parent = computed({
    get: () => props.target,
    set(value) {
      lastParent = value
      emit("update:target", value)
    }
  })

  onMounted(async () => {
    try {
      const response = await fetch(TILEABLES_LIST)
      if (!response.ok) throw new Error(`the tileables could not be loaded (${response.status})`)
      list.value = await response.json()
    } catch (err) {
      loadError.value = err.message
    }
  })

  watch(() => props.target, target => {
    if (target) variant.value = true
  })

  async function pixels(blob) {
    const bitmap = await createImageBitmap(blob, { premultiplyAlpha: "none", colorSpaceConversion: "none" })
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
    const ctx = canvas.getContext("2d")
    ctx.drawImage(bitmap, 0, 0)
    bitmap.close()
    return ctx.getImageData(0, 0, canvas.width, canvas.height).data
  }

  watch(() => props.file, async file => {
    emit("problem", null)
    if (!file?.bytes || pngProblem(file.bytes, "tileable")) return
    const clear = !seeThrough(await pixels(file.blob))
    if (file !== props.file || clear) return
    emit("problem", "Tileables can't have see-through pixels, and this one has some.")
  })
</script>

<template>
  <Segments label="Add it as" v-model="mode" :options="MODES" :hint="`Tileables are repeated across the letters, so their edges have to join up without a seam. They can be ${sizes.slice(0, -1).join(', ')} or ${sizes.at(-1)}, with no see-through pixels.`" />
  <Field group v-if="variant" :label="parents.length ? 'Variant of' : ''" :error="loadError || (tried ? problems.target : '')" hint="Variants are listed under the tileable they belong to, like a different colour of it. A variant has to be the same size as that tileable.">
    <Dropdown v-if="parents.length" v-model="parent" :options="parents" searchable />
  </Field>
</template>
