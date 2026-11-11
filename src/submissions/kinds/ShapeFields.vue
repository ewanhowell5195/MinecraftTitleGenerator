<script setup>
  import { computed } from "vue"
  import Button from "../../components/Button.vue"
  import Field from "../../components/Field.vue"
  import NumberInput from "../../components/NumberInput.vue"
  import UploadField from "../../components/UploadField.vue"
  import { titleCase } from "../../lib/names.js"
  import { stripUse } from "../../lib/strips.js"
  import { MODEL_LIMITS, SHAPE_STRIP_LIMITS, SILHOUETTE_LIMITS } from "../../lib/submissionKinds/shape.js"
  import { SUBMISSION_LIMITS } from "../../lib/submissions.js"
  import { submissionExtraUrl } from "../../lib/submissionsApi.js"
  import { pickedFile } from "../files.js"

  defineOptions({ inheritAttrs: false })

  const props = defineProps({
    fonts: { type: Array, required: true },
    kind: { type: String, required: true },
    details: { type: Object, required: true },
    files: { type: Object, default: () => ({}) },
    initial: { type: Object, default: null },
    problems: { type: Object, required: true },
    tried: { type: Boolean, default: false }
  })

  const emit = defineEmits(["update:files", "update:details"])

  const sets = computed(() => Array.from(new Set(props.fonts.flatMap(entry => entry.strips ?? []).map(item => stripUse(item).id))).sort())
  const uses = computed(() => (props.details.strips ?? []).map(stripUse))

  function used(id) {
    return uses.value.find(use => use.id === id) ?? null
  }

  function save(next) {
    emit("update:details", { ...props.details, strips: next.map(({ id, offset }) => offset ? { id, offset } : id) })
  }

  function toggle(id) {
    save(used(id) ? uses.value.filter(use => use.id !== id) : uses.value.concat({ id, offset: 0 }))
  }

  function setOffset(id, event) {
    const offset = event.target.valueAsNumber
    if (Number.isInteger(offset)) save(uses.value.map(use => use.id === id ? { id, offset } : use))
  }

  async function pick(event) {
    const chosen = event.target.files[0]
    event.target.value = ""
    if (!chosen) return
    emit("update:files", { texture: await pickedFile(chosen) })
  }
</script>

<template>
  <template v-if="kind === 'shapeModel'">
    <p class="hint wide">The model can have up to {{ MODEL_LIMITS.elements }} elements, each reaching no further than {{ MODEL_LIMITS.reach }} from the centre, in a JSON file of up to {{ SUBMISSION_LIMITS.fileBytes / 1000000 }} MB.</p>
    <Field class="wide" label="Texture" required :error="tried || files.texture ? problems.texture : null" :hint="`The one PNG the model uses, up to ${SUBMISSION_LIMITS.side} pixels on each side. Its UVs from 0 to 16 cover the whole image.`">
      <UploadField accept="image/png" :label="files.texture || initial ? 'Replace PNG' : 'Choose a PNG'" empty="No texture chosen" :image="files.texture?.url ?? (initial ? submissionExtraUrl(initial, 'texture') : null)" @change="pick" />
    </Field>
  </template>
  <template v-else>
    <p class="hint wide">The solid pixels make the shape, from {{ SILHOUETTE_LIMITS.minHeight }} to {{ SILHOUETTE_LIMITS.height }} pixels tall and up to {{ SILHOUETTE_LIMITS.width }} wide. The PNG paints its front, and its top and bottom edges take the colours next to them.</p>
    <Field group class="wide" label="Shared strips" :error="problems.strips" :hint="`Optional. The strip sets the shape uses, the same as a font's, up to ${SHAPE_STRIP_LIMITS.sets}. An offset of 0 centres the shape on the strips.`">
      <div class="sets">
        <div v-for="id of sets" :key="id" class="set card card-row">
          <span class="grow">{{ titleCase(id) }}</span>
          <template v-if="used(id)">
            <span>Offset</span>
            <NumberInput class="offset" :value="used(id).offset" :min="-SHAPE_STRIP_LIMITS.offset" :max="SHAPE_STRIP_LIMITS.offset" :aria-label="`Offset for ${titleCase(id)}`" @change="setOffset(id, $event)" />
          </template>
          <Button :primary="!used(id)" :disabled="!used(id) && uses.length >= SHAPE_STRIP_LIMITS.sets" @click="toggle(id)">{{ used(id) ? "Stop using" : "Use" }}</Button>
        </div>
      </div>
    </Field>
  </template>
</template>

<style scoped>
  .sets {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .set {
    align-items: center;
    gap: 8px;
    user-select: none;
  }

  .offset {
    width: 72px;
  }
</style>
