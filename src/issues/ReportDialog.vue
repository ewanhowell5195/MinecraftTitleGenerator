<script setup>
  import { computed, onBeforeUnmount, ref } from "vue"
  import Button from "../components/Button.vue"
  import Checkbox from "../components/Checkbox.vue"
  import Dialog from "../components/Dialog.vue"
  import Field from "../components/Field.vue"
  import Icon from "../components/Icon.vue"
  import Notice from "../components/Notice.vue"
  import SignInButtons from "../components/SignInButtons.vue"
  import UploadField from "../components/UploadField.vue"
  import { IMAGE_TYPES, ISSUE_LIMITS, issueProblems } from "../lib/issues/issues.js"
  import { issuePage, sendIssue } from "../lib/issues/issuesApi.js"
  import { encodeTitle } from "../lib/link/linkformat.js"
  import { account } from "../lib/state/account.js"
  import { titleData } from "../lib/state/titleFile.js"
  import { scene } from "../lib/state/scene.js"

  const emit = defineEmits(["close"])

  const MEGABYTE = 1000000

  const title = ref("")
  const body = ref("")
  const includeTitle = ref(false)
  const images = ref([])
  const imageError = ref("")
  const tried = ref(false)
  const busy = ref(false)
  const error = ref("")
  const sent = ref(null)

  const hasTitle = computed(() => scene.objects.length > 0)
  const uploads = computed(() => includeTitle.value && hasTitle.value ? encodeTitle(titleData()).skipped : 0)
  const problems = computed(() => issueProblems({ title: title.value, body: body.value }))
  const shown = computed(() => tried.value ? problems.value : {})
  const titleHint = computed(() => uploads.value ? "Your title has uploaded fonts or textures, which a link can't carry, so its title file is attached too." : "Adds a link that opens your current title in the generator.")

  function pickImages(event) {
    imageError.value = ""
    const files = Array.from(event.target.files ?? [])
    event.target.value = ""
    for (const file of files) {
      if (images.value.length >= ISSUE_LIMITS.images) {
        imageError.value = `A report can have up to ${ISSUE_LIMITS.images} images.`
        break
      }
      if (!IMAGE_TYPES.split(",").includes(file.type)) imageError.value = "Images have to be PNG or JPEG files."
      else if (file.size > ISSUE_LIMITS.imageBytes) imageError.value = `Images can be up to ${ISSUE_LIMITS.imageBytes / MEGABYTE} MB each.`
      else images.value.push({ file, url: URL.createObjectURL(file) })
    }
  }

  function removeImage(image) {
    URL.revokeObjectURL(image.url)
    images.value = images.value.filter(item => item !== image)
  }

  onBeforeUnmount(() => images.value.forEach(image => URL.revokeObjectURL(image.url)))

  function attachedTitle() {
    if (!includeTitle.value || !hasTitle.value) return { code: null, titleFile: null }
    const data = titleData()
    const { code, skipped } = encodeTitle(data)
    if (!skipped) return { code, titleFile: null }
    const titleFile = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
    if (titleFile.size > ISSUE_LIMITS.titleBytes) throw new Error(`Your title's uploads make its file bigger than ${ISSUE_LIMITS.titleBytes / MEGABYTE} MB, so it can't be attached. Untick it, or describe the uploads instead.`)
    return { code, titleFile }
  }

  async function send() {
    tried.value = true
    if (Object.keys(problems.value).length) return
    busy.value = true
    error.value = ""
    try {
      sent.value = await sendIssue({ title: title.value, body: body.value, images: images.value.map(image => image.file), ...attachedTitle() })
    } catch (err) {
      error.value = err.message
    } finally {
      busy.value = false
    }
  }
</script>

<template>
  <Dialog title="Report an issue" close-title="Close" wide @close="emit('close')">
    <div v-if="sent" class="dialog-body">
      <p>Thanks for reporting it! It's on GitHub now, and you'll get an email when someone replies or it's fixed.</p>
      <div class="dialog-actions">
        <Button @click="emit('close')">Done</Button>
        <Button primary :href="issuePage(sent.id)" target="_blank" rel="noopener"><template #icon><Icon name="link" :size="16" /></template>See your report</Button>
      </div>
    </div>
    <div v-else-if="!account" class="dialog-body">
      <p>Sign in to report an issue. You'll be emailed when someone replies or it's fixed.</p>
      <SignInButtons />
    </div>
    <form v-else class="dialog-body" @submit.prevent="send">
      <p class="hint">Your report becomes a public issue on GitHub, posted with your account name.</p>
      <Field label="Title" required :error="shown.title">
        <input v-model="title" type="text" :maxlength="ISSUE_LIMITS.title" placeholder="What went wrong?">
      </Field>
      <Field label="Description" required :error="shown.body" hint="What you did, what you expected, and what happened instead.">
        <textarea v-model="body" rows="6" :maxlength="ISSUE_LIMITS.body"></textarea>
      </Field>
      <Field group label="Images" :error="imageError" :hint="`Screenshots help a lot. Up to ${ISSUE_LIMITS.images} PNG or JPEG images.`">
        <ul v-if="images.length" class="images">
          <li v-for="image of images" :key="image.url">
            <img :src="image.url" alt="">
            <Button ghost class="remove" icon="close" title="Remove image" @click="removeImage(image)" />
          </li>
        </ul>
        <UploadField v-if="images.length < ISSUE_LIMITS.images" multiple :accept="IMAGE_TYPES" label="Add images" @change="pickImages" />
      </Field>
      <Checkbox v-model="includeTitle" :disabled="!hasTitle" :hint="titleHint">Include my current title</Checkbox>
      <Notice v-if="error">{{ error }}</Notice>
      <div class="dialog-actions">
        <Button @click="emit('close')">Cancel</Button>
        <Button primary type="submit" :disabled="busy">Send report</Button>
      </div>
    </form>
  </Dialog>
</template>

<style scoped>
  textarea {
    resize: vertical;
  }

  .images {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .images li {
    position: relative;
    aspect-ratio: 1;
    background: var(--field);
  }

  .images img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .remove {
    position: absolute;
    top: 2px;
    right: 2px;
  }
</style>
