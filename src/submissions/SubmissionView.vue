<script setup>
  import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue"
  import Button from "../components/Button.vue"
  import Icon from "../components/Icon.vue"
  import MessageDialog from "../components/MessageDialog.vue"
  import NavTabs from "../components/NavTabs.vue"
  import Notice from "../components/Notice.vue"
  import Spinner from "../components/Spinner.vue"
  import UserName from "../components/UserName.vue"
  import { authorText } from "../lib/core/authors.js"
  import { account } from "../lib/state/account.js"
  import { SUBMISSION_KINDS } from "../lib/submissions/kinds/index.js"
  import { publishedTitle } from "../lib/submissions/kinds/published.js"
  import { SUBMISSION_PARAM } from "./submissionLink.js"
  import { markNotificationsSeen, notifications, submissionExtraUrl, submissionFileUrl, submissionPage, submissionProcessing, submissionThread, withdrawSubmission } from "../lib/submissions/submissionsApi.js"
  import CommentThread from "./CommentThread.vue"
  import { KIND_COMPONENTS } from "./kinds/components.js"
  import { CLIENT_KINDS, submissionTitle } from "./kinds/index.js"
  import { askConfirm } from "../lib/state/confirm.js"
  import CharacterGrid from "./kinds/CharacterGrid.vue"
  import ReviewPanel from "./ReviewPanel.vue"
  import SubmissionFiles from "./SubmissionFiles.vue"
  import SubmissionForm from "./SubmissionForm.vue"
  import { router } from "../router.js"

  const PROCESSING_POLL = 5000
  const TABS = [{ id: "comments", label: "Comments" }, { id: "characters", label: "Characters" }, { id: "files", label: "Files" }]

  const props = defineProps({
    id: { type: Number, required: true },
    fonts: { type: Array, required: true },
    editing: { type: Boolean, default: false }
  })

  const item = ref(null)
  const comments = ref([])
  const reviewer = ref(false)
  const error = ref("")
  const text = ref("")
  const busy = ref(false)
  const outcome = ref(null)

  const processing = ref(null)
  const saving = ref(false)
  const known = ref(props.editing)
  const tab = ref("comments")
  const textureKey = ref("")
  let pollTimer = null

  const client = computed(() => CLIENT_KINDS[item.value?.kind])
  const title = computed(() => item.value && submissionTitle(item.value, props.fonts))
  const tabs = computed(() => item.value?.kind === "font" ? TABS : TABS.filter(entry => entry.id !== "characters"))
  const gridTexture = computed(() => {
    const extras = item.value?.details.extras ?? []
    const extra = extras.find(entry => entry.key === textureKey.value) ?? (textureKey.value ? null : extras.find(entry => entry.kind === "flat"))
    return extra ? { kind: extra.kind, url: submissionExtraUrl(item.value, extra.key) } : null
  })
  const previewLink = computed(() => item.value?.previewUrl && `${item.value.previewUrl}${publishedTitle(item.value, props.fonts)}`)
  const openable = computed(() => client.value.openable?.(item.value) ?? true)
  const reviewing = computed(() => reviewer.value && item.value?.status === "open" && !!item.value.pullUrl)
  const changeable = computed(() => (item.value?.mine || reviewer.value) && item.value?.status === "open")
  const page = submissionPage(props.id)

  async function load() {
    try {
      const thread = await submissionThread(props.id)
      item.value = thread.submission
      comments.value = thread.comments
      reviewer.value = thread.reviewer
      if (props.editing && !changeable.value) router.replace(page)
    } catch (err) {
      error.value = err.message
    }
  }

  async function checkProcessing() {
    clearTimeout(pollTimer)
    if (props.editing || item.value && item.value.status !== "open") {
      known.value = true
      return
    }
    const before = processing.value?.state
    try {
      processing.value = await submissionProcessing(props.id)
    } catch (err) {
      console.error(err)
      processing.value = null
      return
    } finally {
      known.value = true
    }
    if (processing.value.state === "processing") pollTimer = setTimeout(checkProcessing, PROCESSING_POLL)
    else if (before === "processing") load()
  }

  async function markSeen() {
    if (!account.value || !(item.value?.mine || reviewer.value)) return
    if ((await notifications()).some(entry => entry.submission === props.id && !entry.seen)) await markNotificationsSeen(props.id)
  }

  function reviewed(result) {
    outcome.value = result.outcome
  }

  function leave() {
    router.push("/submissions/")
  }

  async function withdraw() {
    if (!await askConfirm({ title: "Withdraw submission", message: `Withdraw ${title.value}? It's removed from this site, but it can still be accepted.`, action: "Withdraw", danger: true })) return
    busy.value = true
    try {
      await withdrawSubmission(props.id)
      leave()
    } catch (err) {
      error.value = err.message
      busy.value = false
    }
  }

  function saved(submission) {
    item.value = submission
    processing.value = { state: "processing" }
    known.value = true
    clearTimeout(pollTimer)
    router.replace(page).finally(() => {
      saving.value = false
      checkProcessing()
    })
  }

  function cancel() {
    if (history.state?.back?.replace(/\/$/, "") === page.replace(/\/$/, "")) router.back()
    else router.push(page)
  }

  onMounted(() => Promise.all([load(), checkProcessing()]))
  onBeforeUnmount(() => clearTimeout(pollTimer))
  watch(() => props.editing, editing => {
    if (!editing && !saving.value) checkProcessing()
  })
  watch(() => [title.value, props.editing], ([name, editing]) => {
    if (name) document.title = `${editing ? "Edit " : ""}${name} | Submissions | Minecraft Title Generator`
  })
  watch(() => [item.value?.mine, reviewer.value, account.value?.id], () => markSeen().catch(err => console.error(err)))
  watch(() => account.value?.id, () => {
    if (item.value) load()
  })
</script>

<template>
  <Notice v-if="error && !item">{{ error }}</Notice>
  <template v-else-if="item">
    <section class="intro">
      <a class="hint" href="/submissions/">Submissions</a>
      <h1>{{ title }}</h1>
      <p>{{ client.summary(item, fonts) }}, made by {{ authorText(item.credit) }}.</p>
      <blockquote v-if="item.notes" class="notes">{{ item.notes }}</blockquote>
    </section>
    <div v-if="editing" v-show="!saving">
      <SubmissionForm :fonts="fonts" :initial="item" @done="saved" @cancel="cancel" @saving="saving = $event" />
    </div>
    <section v-if="saving || !editing && processing?.state === 'processing'" class="processing">
      <Spinner />
      <h2>Processing submission</h2>
      <p class="hint">GitHub is building its files. This usually takes a minute or two, and this page updates when it's done.</p>
    </section>
    <template v-else-if="!editing && known">
      <Notice v-if="processing?.state === 'failed' && !reviewing"><p>Processing this submission failed on GitHub. <a :href="processing.url" target="_blank" rel="noopener">See what went wrong</a>.</p></Notice>
      <MessageDialog v-if="outcome" :title="outcome === 'published' ? 'Submission merged' : 'Submission declined'" @close="leave">{{ outcome === "published" ? `${title} was merged, and is now part of the generator.` : `${title} was declined.` }}</MessageDialog>
      <ReviewPanel v-if="reviewing" :key="item.updatedAt" :item="item" :title="title" :failed-url="processing?.state === 'failed' ? processing.url : ''" @done="reviewed" />
      <div class="submission-view">
        <div class="preview flow">
          <component :is="KIND_COMPONENTS[item.kind].Preview" v-model:texture="textureKey" :fonts="fonts" :kind="item.kind" :target="item.target" :details="item.details" :initial="item" :url="submissionFileUrl(item)" :text="text || title" />
          <input v-if="SUBMISSION_KINDS[item.kind].noun !== 'shape'" type="text" v-model="text" :placeholder="title" spellcheck="false" aria-label="Preview text">
        </div>
        <div class="details flow">
          <dl>
            <dt>Type</dt>
            <dd>{{ SUBMISSION_KINDS[item.kind].label }}</dd>
            <template v-for="row of client.rows(item, fonts)" :key="row.label">
              <dt>{{ row.label }}</dt>
              <dd><span v-if="row.colour" class="swatch" :style="{ background: row.colour }"></span>{{ row.value }}</dd>
            </template>
            <dt>Credit</dt>
            <dd>{{ authorText(item.credit) }}</dd>
            <template v-if="item.details.source">
              <dt>Source</dt>
              <dd><a class="ellipsis link" :href="item.details.source" target="_blank" rel="noopener">{{ item.details.source }}</a></dd>
              <dt>Licence</dt>
              <dd><a class="ellipsis link" :href="item.details.licence" target="_blank" rel="noopener">{{ item.details.licence }}</a></dd>
            </template>
            <dt>Submitted by</dt>
            <dd v-if="item.ownerName"><UserName :name="item.ownerName" :provider="item.ownerProvider" /></dd>
            <dd v-else>A deleted account</dd>
          </dl>
          <div class="actions">
            <Button v-if="openable" primary :href="`/app/?${SUBMISSION_PARAM}=${item.id}`">Open in generator</Button>
            <Button v-else-if="previewLink" primary :href="previewLink" target="_blank" rel="noopener" v-tooltip="'The generator built from this submission\'s branch, with it added'"><template #icon><Icon name="eye" :size="16" /></template>Open preview</Button>
            <Button v-if="item.pullUrl" :href="item.pullUrl" target="_blank" rel="noopener"><template #icon><Icon name="github" :size="16" /></template>Pull request</Button>
          </div>
          <div v-if="changeable" class="actions">
            <Button :href="`${page}/edit`"><template #icon><Icon name="pencil" :size="16" /></template>Edit</Button>
            <Button v-if="item.mine" danger :disabled="busy" @click="withdraw"><template #icon><Icon name="trash" :size="16" /></template>Withdraw</Button>
          </div>
          <Notice v-if="error">{{ error }}</Notice>
        </div>
      </div>
      <section class="section">
        <NavTabs v-model="tab" :tabs="tabs" />
        <CommentThread v-show="tab === 'comments'" :id="item.id" :comments="comments" :can-comment="item.mine || reviewer" @update="comments = $event" />
        <CharacterGrid v-if="item.kind === 'font'" v-show="tab === 'characters'" :url="submissionFileUrl(item)" :texture="gridTexture" />
        <SubmissionFiles v-show="tab === 'files'" :item="item" />
      </section>
    </template>
  </template>
</template>

<style scoped>
  .submission-view {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 320px);
    align-items: start;
    gap: 28px;
  }

  .submission-view > .details {
    align-self: stretch;
    gap: 8px;
  }

  .submission-view > .details > .actions:first-of-type {
    margin-top: auto;
  }

  .processing {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 64px 16px;
    text-align: center;
    background: var(--surface);
  }

  .processing .hint {
    max-width: 46ch;
  }

  @media (max-width: 760px) {
    .submission-view {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
