<script setup>
  import { computed, onBeforeUnmount, ref, watch } from "vue"
  import Icon from "../components/Icon.vue"
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

  const KINDS = Object.values(SUBMISSION_KINDS).filter(type => type.available).map(type => ({ value: type.id, label: type.label }))
  const TEXTURE_KINDS = KINDS.filter(item => item.value !== "font")
  const GROUPS = [{ value: "texture", label: "Texture" }].concat(KINDS.some(item => item.value === "font") ? { value: "font", label: "Font" } : [])
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
  const problems = ref({})
  const extraProblem = ref(null)
  const tried = ref(false)
  const sending = ref(false)
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
  const blocked = computed(() => !account.value || sending.value)

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
  <form class="submission-form" @submit.prevent="send">
    <div class="fields flow">
      <Segments v-if="GROUPS.length > 1" v-model="group" :options="GROUPS" label="Type" />
      <Segments v-if="group === 'texture'" v-model="kind" :options="TEXTURE_KINDS" label="Texture type" />
      <component :is="parts.Fields" v-model:target="target" v-model:details="details" v-model:files="extras" :fonts="fonts" :kind="kind" :file="chosen" :initial="initial" :name="name" :problems="problems" :tried="tried" @problem="extraProblem = $event" />
      <div class="field">
        <span class="label">{{ type.label }}</span>
        <div class="upload-preview">
          <img v-if="fileUrl && isImage && CLIENT_KINDS[kind].image" :src="fileUrl" alt="">
          <div v-else-if="chosen" class="empty">{{ chosen.name }}</div>
          <div v-else-if="sameChoice" class="empty">The {{ type.noun }} you sent</div>
          <div v-else class="empty">No {{ type.noun }} chosen</div>
        </div>
        <label class="button wide">
          <Icon name="open" :size="16" />
          <span>{{ fileUrl ? `Replace ${type.noun}` : isImage ? "Choose a PNG" : "Choose a JSON file" }}</span>
          <input type="file" :accept="isImage ? 'image/png' : '.json,application/json'" @change="pick">
        </label>
        <p v-if="fileProblem && (tried || chosen)" class="hint bad">{{ fileProblem }}</p>
      </div>
      <label class="field">
        <span class="label">Name</span>
        <input type="text" v-model="name" :maxlength="SUBMISSION_LIMITS.name" spellcheck="false">
        <span v-if="shown.name" class="hint bad">{{ shown.name }}</span>
      </label>
      <label class="field">
        <span class="label">Credit</span>
        <input type="text" v-model="credit" :maxlength="SUBMISSION_LIMITS.credit" spellcheck="false">
        <span v-if="shown.credit" class="hint bad">{{ shown.credit }}</span>
        <span v-else class="hint">Shown as the {{ type.noun }}'s author. List everyone who made it.</span>
      </label>
      <label class="field">
        <span class="label">Notes for the reviewer</span>
        <textarea v-model="notes" :maxlength="SUBMISSION_LIMITS.notes" rows="3" placeholder="Optional"></textarea>
        <span v-if="shown.notes" class="hint bad">{{ shown.notes }}</span>
      </label>
      <label v-if="!initial" class="check">
        <input type="checkbox" v-model="agree">
        <span>I agree to the <a href="/terms/" target="_blank" rel="noopener">Terms of Service</a></span>
      </label>
      <span v-if="shown.agree" class="hint bad">{{ shown.agree }}</span>
      <p v-if="error" class="hint bad">{{ error }}</p>
      <div v-if="!account" class="sign-in">
        <p class="hint">Sign in to send a {{ type.noun }}. Your submission is linked to your account so you can follow its review.</p>
        <div class="buttons">
          <button v-for="id of signInProviders" :key="id" type="button" @click="signIn(id)"><Icon :name="id" :size="16" />Sign in with {{ providerLabel(id) }}</button>
        </div>
      </div>
      <div class="buttons">
        <button v-if="initial" type="button" @click="emit('cancel')">Cancel</button>
        <button class="primary" type="submit" :disabled="blocked">{{ sending ? "Sending..." : initial ? "Save changes" : "Send for review" }}</button>
      </div>
    </div>
    <div class="preview flow">
      <component :is="parts.Preview" :fonts="fonts" :kind="kind" :target="target" :details="details" :files="extras" :initial="initial" :url="fileUrl" :text="previewText || name || 'Minecraft'" />
      <input type="text" v-model="previewText" :placeholder="name || 'Minecraft'" spellcheck="false" aria-label="Preview text">
    </div>
  </form>
</template>
