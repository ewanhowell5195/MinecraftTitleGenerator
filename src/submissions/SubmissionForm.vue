<script setup>
  import { computed, onBeforeUnmount, ref, watch } from "vue"
  import Icon from "../components/Icon.vue"
  import NavTabs from "../components/NavTabs.vue"
  import Segments from "../components/Segments.vue"
  import { account, signIn, signInProviders } from "../lib/community.js"
  import { providerLabel } from "../lib/providers.js"
  import { SUBMISSION_KINDS, checkSubmission, submissionContext } from "../lib/submissionKinds/index.js"
  import { EDITOR_SUBMISSION, SUBMISSION_LIMITS } from "../lib/submissions.js"
  import { editSubmission, sendSubmission, submissionFileUrl } from "../lib/submissionsApi.js"
  import { KIND_COMPONENTS } from "./kinds/components.js"
  import { CLIENT_KINDS } from "./kinds/index.js"

  const props = defineProps({
    fonts: { type: Array, required: true },
    initial: { type: Object, default: null },
    prefill: { type: Object, default: () => ({}) }
  })

  const emit = defineEmits(["done", "cancel"])

  const ABOUT = {
    texture: "Paint over a font's template to fill its letters.",
    overlay: "A see-through layer drawn over any texture.",
    strip: "Runs down the letters from top to bottom, repeating along the line.",
    tileable: "A seamless pattern repeated across the letters."
  }
  const KINDS = Object.values(SUBMISSION_KINDS).filter(type => type.available).map(type => ({ value: type.id, label: type.label, about: ABOUT[type.id] }))
  const TEXTURE_KINDS = KINDS.filter(item => !["font", "overlay"].includes(item.value)).concat(KINDS.filter(item => item.value === "overlay"))
  const GROUPS = [{ id: "texture", label: "Texture" }].concat(KINDS.some(item => item.value === "font") ? { id: "font", label: "Font" } : [])
  const { type: prefillKind, font: prefillTarget, name: prefillName, credit: prefillCredit, from: prefillFrom, ...prefillDetails } = props.prefill
  const startKind = props.initial?.kind ?? prefillKind
  const kind = ref(SUBMISSION_KINDS[startKind]?.available ? startKind : "texture")
  const target = ref(props.initial?.target ?? prefillTarget ?? "")
  const details = ref(props.initial ? { ...props.initial.details } : prefillDetails)
  const name = ref(props.initial?.name ?? prefillName ?? "")
  const credit = ref(props.initial?.credit ?? prefillCredit ?? account.value?.name ?? "")
  const notes = ref(props.initial?.notes ?? "")
  const agree = ref(!!props.initial)
  const chosen = ref(null)
  const extras = ref({})
  const previewText = ref("")
  const previewFont = ref("")
  const problems = ref({})
  const extraProblem = ref(null)
  const tried = ref(false)
  const sending = ref(false)
  const dragging = ref(false)
  const error = ref("")
  const context = submissionContext(props.fonts, path => fetch(path))
  let checks = 0

  let textureKind = kind.value === "font" ? "texture" : kind.value

  const group = computed({
    get: () => kind.value === "font" ? "font" : "texture",
    set: value => kind.value = value === "font" ? "font" : textureKind
  })
  const type = computed(() => SUBMISSION_KINDS[kind.value])
  const parts = computed(() => KIND_COMPONENTS[kind.value])
  const isImage = computed(() => type.value.accept === "image/png")
  const sameChoice = computed(() => !!props.initial && kind.value === props.initial.kind && target.value === props.initial.target)
  const fileUrl = computed(() => chosen.value?.url ?? (sameChoice.value ? submissionFileUrl(props.initial) : null))
  const fileProblem = computed(() => {
    if (!chosen.value && !sameChoice.value) return props.initial ? `Choose the ${type.value.noun}'s file again for the new choice.` : `Choose the ${type.value.noun}'s file.`
    return extraProblem.value ?? problems.value.file ?? null
  })
  const shown = computed(() => {
    const visible = key => tried.value || key === "name" && name.value || key === "credit" && credit.value || key === "notes"
    return Object.fromEntries(Object.entries(problems.value).filter(([key]) => visible(key)))
  })
  const blocked = computed(() => !account.value || sending.value || Object.keys(problems.value).length > 0 || !!fileProblem.value)

  watch(kind, (next, before) => {
    if (next !== "font") textureKind = next
    if (KIND_COMPONENTS[next] !== KIND_COMPONENTS[before]) {
      details.value = {}
      target.value = ""
    }
    chosen.value = null
    extras.value = {}
    extraProblem.value = null
  })

  watch(account, next => {
    if (next && !credit.value) credit.value = next.name
  })

  watch(() => [kind.value, target.value, JSON.stringify(details.value), chosen.value, extras.value, name.value, credit.value, notes.value, agree.value], async () => {
    const check = ++checks
    const files = Object.fromEntries(Object.entries(extras.value).map(([key, extra]) => [key, extra.bytes]))
    const result = await checkSubmission({ kind: kind.value, target: target.value, details: details.value, bytes: chosen.value?.bytes ?? null, files, name: name.value, credit: credit.value, notes: notes.value, agree: agree.value }, context)
    if (check === checks) problems.value = result.problems
  }, { immediate: true })

  function fillFromFont(bytes) {
    let json
    try {
      json = JSON.parse(new TextDecoder().decode(bytes))
    } catch {
      return
    }
    if (!name.value && typeof json.name === "string") name.value = json.name.slice(0, SUBMISSION_LIMITS.name)
    if (typeof json.author === "string" && json.author && (!credit.value || credit.value === account.value?.name)) credit.value = json.author.slice(0, SUBMISSION_LIMITS.credit)
  }

  async function use(file) {
    if (chosen.value) URL.revokeObjectURL(chosen.value.url)
    extraProblem.value = null
    chosen.value = { blob: file, bytes: new Uint8Array(await file.arrayBuffer()), url: URL.createObjectURL(file), name: file.name }
    if (kind.value === "font") fillFromFont(chosen.value.bytes)
  }

  function pick(event) {
    const file = event.target.files[0]
    event.target.value = ""
    if (file) use(file)
  }

  function drop(event) {
    dragging.value = false
    const file = event.dataTransfer.files[0]
    if (file) use(file)
  }

  function takeEditorFont() {
    const saved = sessionStorage.getItem(EDITOR_SUBMISSION)
    sessionStorage.removeItem(EDITOR_SUBMISSION)
    if (!saved) return
    const { name: fileName, text } = JSON.parse(saved)
    use(new File([text], fileName, { type: "application/json" }))
  }

  if (prefillFrom === "editor" && kind.value === "font" && !props.initial) takeEditorFont()

  async function send() {
    tried.value = true
    error.value = ""
    if (Object.keys(problems.value).length || fileProblem.value) return
    sending.value = true
    try {
      const fields = { kind: kind.value, target: target.value, details: details.value, name: name.value, credit: credit.value, notes: notes.value }
      const sent = Object.fromEntries(Object.entries(extras.value).map(([key, extra]) => [key, extra.blob]))
      if (props.initial) emit("done", await editSubmission(props.initial.id, fields, chosen.value?.blob, sent))
      else emit("done", await sendSubmission(fields, chosen.value.blob, agree.value, sent))
    } catch (err) {
      error.value = err.message
    } finally {
      sending.value = false
    }
  }

  onBeforeUnmount(() => {
    if (chosen.value) URL.revokeObjectURL(chosen.value.url)
  })
</script>

<template>
  <div v-if="!account" class="sign-in banner">
    <p>Sign in to send a {{ type.noun }}. Your submission is linked to your account so you can follow its review.</p>
    <div class="buttons">
      <button v-for="id of signInProviders" :key="id" type="button" @click="signIn(id)"><Icon :name="id" :size="16" />Sign in with {{ providerLabel(id) }}</button>
    </div>
  </div>
  <form class="submission-form" @submit.prevent="send">
    <NavTabs v-if="GROUPS.length > 1" v-model="group" :tabs="GROUPS" />
    <div class="columns">
      <label class="field">
        <span class="label">Name <span class="required" aria-hidden="true">*</span></span>
        <input type="text" v-model="name" :maxlength="SUBMISSION_LIMITS.name" spellcheck="false" required>
        <span v-if="shown.name" class="hint bad">{{ shown.name }}</span>
        <span v-else class="hint">Shown as the {{ type.noun }}'s name in the generator.</span>
      </label>
      <label class="field">
        <span class="label">Credit <span v-if="kind !== 'font'" class="required" aria-hidden="true">*</span></span>
        <input type="text" v-model="credit" :maxlength="SUBMISSION_LIMITS.credit" spellcheck="false" :required="kind !== 'font'">
        <span v-if="shown.credit" class="hint bad">{{ shown.credit }}</span>
        <span v-else class="hint">Shown as the {{ type.noun }}'s author. List everyone who made it.</span>
      </label>
    </div>
    <div v-if="group === 'texture'" class="field">
      <Segments v-model="kind" :options="TEXTURE_KINDS" label="Kind of texture" />
      <p class="hint">{{ ABOUT[kind] }}</p>
    </div>
    <div class="stage-area" :class="{ dragging }" @dragover.prevent="dragging = true" @dragleave.self="dragging = false" @drop.prevent="drop">
      <template v-if="fileUrl || chosen">
        <component :is="parts.Preview" v-bind="kind === 'strip' ? { font: previewFont, 'onUpdate:font': id => previewFont = id } : {}" :fonts="fonts" :kind="kind" :target="target" :details="details" :files="extras" :initial="initial" :url="fileUrl" :text="previewText || name || 'Minecraft'" />
        <div class="stage-bar">
          <input type="text" v-model="previewText" :placeholder="name || 'Minecraft'" spellcheck="false" aria-label="Preview text">
          <label class="button">
            <Icon name="open" :size="16" />
            <span>Replace file</span>
            <input type="file" :accept="isImage ? 'image/png' : '.json,application/json'" @change="pick">
          </label>
        </div>
      </template>
      <label v-else class="drop">
        <Icon name="upload" :size="32" />
        <strong>{{ isImage ? "Drop your PNG here" : "Drop your font's JSON file here" }} <span class="required" aria-hidden="true">*</span></strong>
        <span class="button">Choose a file</span>
        <input type="file" :accept="isImage ? 'image/png' : '.json,application/json'" @change="pick">
      </label>
    </div>
    <p v-if="fileProblem && (tried || chosen)" class="hint bad">{{ fileProblem }}</p>
    <div class="kind-fields">
      <component :is="parts.Fields" v-bind="kind === 'strip' ? { onPreview: id => previewFont = id } : {}" v-model:target="target" v-model:details="details" v-model:files="extras" :fonts="fonts" :kind="kind" :file="chosen" :initial="initial" :name="name" :problems="problems" :tried="tried" @problem="extraProblem = $event" />
    </div>
    <label class="field">
      <span class="label">Notes for the reviewer</span>
      <textarea v-model="notes" :maxlength="SUBMISSION_LIMITS.notes" rows="3" placeholder="Optional"></textarea>
      <span v-if="shown.notes" class="hint bad">{{ shown.notes }}</span>
    </label>
    <div class="finish">
      <label v-if="!initial" class="check">
        <input type="checkbox" v-model="agree">
        <span>I agree to the <a href="/terms/" target="_blank" rel="noopener">Terms of Service</a> <span class="required" aria-hidden="true">*</span></span>
      </label>
      <p v-if="shown.agree || error" class="hint bad">{{ error || shown.agree }}</p>
      <div class="buttons">
        <button v-if="initial" type="button" @click="emit('cancel')">Cancel</button>
        <button class="primary" type="submit" :disabled="blocked">{{ sending ? "Sending..." : initial ? "Save changes" : "Send for review" }}</button>
      </div>
    </div>
  </form>
</template>

<style scoped>
  .banner {
    flex-direction: row;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 12px 24px;
    padding: 16px 20px;
  }

  .banner p {
    margin: 0;
    color: var(--muted);
  }

  .submission-form {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .stage-area {
    display: flex;
    flex-direction: column;
    gap: 8px;
    outline: 2px dashed transparent;
    outline-offset: 4px;
  }

  .stage-area.dragging {
    outline-color: var(--accent);
  }

  .stage-area :deep(.render) {
    height: 340px;
    aspect-ratio: auto;
  }

  .stage-bar {
    display: flex;
    gap: 8px;
  }

  .stage-bar input {
    flex: 1;
    min-width: 0;
  }

  .drop {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    height: 340px;
    color: var(--faint);
    background: var(--checker);
    border: 2px dashed var(--line-strong);
    cursor: pointer;
    user-select: none;
  }

  .drop:hover,
  .dragging .drop {
    border-color: var(--accent);
  }

  .drop strong {
    font-size: var(--font-lg);
    color: var(--text);
  }

  .columns {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 32px;
  }

  .kind-fields {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    grid-auto-flow: row dense;
    align-items: start;
    gap: 20px 32px;
  }

  .kind-fields > :deep(.wide),
  .kind-fields > :deep(.check),
  .kind-fields > :deep(.hint) {
    grid-column: 1 / -1;
  }

  .kind-fields > :deep(.hint) {
    margin: 0;
  }

  .required {
    color: var(--danger);
  }

  .field .hint {
    margin: 0;
  }

  .finish {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px 20px;
    padding-top: 20px;
    border-top: 1px solid var(--line);
  }

  .finish .hint {
    margin: 0;
  }

  .finish .buttons {
    margin-left: auto;
  }

  @media (max-width: 760px) {
    .columns,
    .kind-fields {
      grid-template-columns: minmax(0, 1fr);
      gap: 16px;
    }

    .stage-area :deep(.render),
    .drop {
      height: 220px;
    }
  }
</style>
