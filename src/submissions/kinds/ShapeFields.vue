<script setup>
  import { computed, ref, shallowRef, watch } from "vue"
  import Field from "../../components/Field.vue"
  import Icon from "../../components/Icon.vue"
  import Notice from "../../components/Notice.vue"
  import UploadField from "../../components/UploadField.vue"
  import SharedStrips from "../../fontEditor/SharedStrips.vue"
  import { silhouetteFont } from "../../lib/customFonts.js"
  import { SILHOUETTE_TEXT } from "../../lib/shapes.js"
  import { MODEL_LIMITS, SHAPE_STRIP_LIMITS, SILHOUETTE_LIMITS } from "../../lib/submissionKinds/shape.js"
  import { SUBMISSION_LIMITS } from "../../lib/submissions.js"
  import { submissionExtraUrl, submissionFileUrl } from "../../lib/submissionsApi.js"
  import { pickedFile } from "../files.js"

  defineOptions({ inheritAttrs: false })

  const props = defineProps({
    fonts: { type: Array, required: true },
    kind: { type: String, required: true },
    details: { type: Object, required: true },
    files: { type: Object, default: () => ({}) },
    file: { type: Object, default: null },
    trial: { type: Object, default: null },
    initial: { type: Object, default: null },
    problems: { type: Object, required: true },
    tried: { type: Boolean, default: false }
  })

  const emit = defineEmits(["update:files", "update:details", "update:trial"])

  const open = ref(false)
  const shape = shallowRef(null)
  const shapeError = ref("")
  const strips = computed(() => props.details.strips ?? [])
  const url = computed(() => props.file?.url ?? (props.initial?.kind === props.kind ? submissionFileUrl(props.initial) : null))

  function save(next) {
    emit("update:details", { ...props.details, strips: next })
  }

  watch(() => props.kind === "shapeImage" && open.value && url.value, async wanted => {
    shape.value = null
    shapeError.value = ""
    if (!wanted) return
    try {
      const font = await silhouetteFont(wanted)
      if (wanted === url.value) shape.value = font
    } catch (err) {
      if (wanted === url.value) shapeError.value = err.message
    }
  }, { immediate: true })

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
    <div class="strips wide">
      <button type="button" class="strips-head" :class="{ open }" :aria-expanded="open" @click="open = !open">
        <Icon class="chevron" name="down" :size="14" />
        <span class="grow">Shared strips</span>
        <span class="hint">{{ strips.length ? `${strips.length} used` : "Optional" }}</span>
      </button>
      <span v-if="problems.strips" class="hint bad">{{ problems.strips }}</span>
      <div v-if="open" class="strips-body">
        <p v-if="!url" class="hint">Choose the shape's PNG first, to see which strips it fits.</p>
        <Notice v-else-if="shapeError">The shape couldn't be read: {{ shapeError }}</Notice>
        <SharedStrips v-else-if="shape" subject="shape" :preview="false" :selected="trial" :sample="SILHOUETTE_TEXT" :titled="false" :font="shape" :strips="strips" :max-sets="SHAPE_STRIP_LIMITS.sets" :max-offset="SHAPE_STRIP_LIMITS.offset" @update:strips="save" @select="emit('update:trial', $event)" />
      </div>
    </div>
  </template>
</template>

<style scoped>
  .strips {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .strips-head {
    justify-content: flex-start;
    width: 100%;
    font-weight: 600;
    text-align: left;
    user-select: none;
  }

  .chevron {
    flex: none;
    color: var(--faint);
    transform: rotate(-90deg);
    transition: transform var(--duration);
  }

  .strips-head.open .chevron {
    transform: none;
  }

  .strips-body {
    display: flex;
    flex-direction: column;
    gap: 20px;
    padding: 14px;
    background: var(--surface);
  }
</style>
