<script setup>
  import { computed, onMounted, ref, watch } from "vue"
  import Icon from "../components/Icon.vue"
  import { account } from "../lib/community.js"
  import { providerLabel } from "../lib/providers.js"
  import { SUBMISSION_KINDS } from "../lib/submissionKinds/index.js"
  import { SUBMISSION_PARAM } from "../lib/submissionLink.js"
  import { SUBMISSION_STATUSES } from "../lib/submissions.js"
  import { markNotificationsSeen, notifications, submissionFileUrl, submissionPage, submissionThread, withdrawSubmission } from "../lib/submissionsApi.js"
  import CommentThread from "./CommentThread.vue"
  import { KIND_COMPONENTS } from "./kinds/components.js"
  import { CLIENT_KINDS } from "./kinds/index.js"
  import ReviewPanel from "./ReviewPanel.vue"
  import SubmissionForm from "./SubmissionForm.vue"

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

  const client = computed(() => CLIENT_KINDS[item.value?.kind])
  const changeable = computed(() => item.value?.mine && item.value.status === "open")
  const page = submissionPage(props.id)

  async function load() {
    try {
      const thread = await submissionThread(props.id)
      item.value = thread.submission
      comments.value = thread.comments
      reviewer.value = thread.reviewer
      if (props.editing && !changeable.value) location.replace(page)
    } catch (err) {
      error.value = err.message
    }
  }

  async function markSeen() {
    if (!account.value || !(item.value?.mine || reviewer.value)) return
    if ((await notifications()).some(entry => entry.submission === props.id && !entry.seen)) await markNotificationsSeen()
  }

  function reviewed(result) {
    item.value = result.submission
    comments.value = result.comments
  }

  async function withdraw() {
    if (!confirm(`Withdraw ${item.value.name}? It's removed from this site, but it can still be accepted.`)) return
    busy.value = true
    try {
      await withdrawSubmission(props.id)
      location.assign("/submit/")
    } catch (err) {
      error.value = err.message
      busy.value = false
    }
  }

  function saved() {
    location.replace(page)
  }

  function cancel() {
    if (document.referrer === new URL(page, location.origin).href) history.back()
    else location.assign(page)
  }

  onMounted(load)
  watch(() => item.value?.name, name => {
    if (name) document.title = `${props.editing ? "Edit " : ""}${name} | Submissions | Minecraft Title Generator`
  })
  watch(() => [item.value?.mine, reviewer.value, account.value?.id], () => markSeen().catch(err => console.error(err)))
  watch(() => account.value?.id, () => {
    if (item.value) load()
  })
</script>

<template>
  <p v-if="error && !item" class="hint bad">{{ error }}</p>
  <template v-else-if="item">
    <section class="intro">
      <a class="hint" href="/submit/">Submit to the title generator</a>
      <h1>{{ item.name }}</h1>
      <p>{{ client.summary(item, fonts) }}, made by {{ item.credit }}.</p>
    </section>
    <SubmissionForm v-if="editing" :fonts="fonts" :initial="item" @done="saved" @cancel="cancel" />
    <div v-else class="submission-view">
      <div class="preview flow">
        <component :is="KIND_COMPONENTS[item.kind].Preview" :fonts="fonts" :kind="item.kind" :target="item.target" :details="item.details" :initial="item" :url="submissionFileUrl(item)" :text="text || item.name" />
        <input type="text" v-model="text" :placeholder="item.name" spellcheck="false" aria-label="Preview text">
      </div>
      <div class="details flow">
        <span class="status" :class="item.status">{{ SUBMISSION_STATUSES[item.status] }}</span>
        <dl>
          <dt>Type</dt>
          <dd>{{ SUBMISSION_KINDS[item.kind].label }}</dd>
          <template v-for="row of client.rows(item, fonts)" :key="row.label">
            <dt>{{ row.label }}</dt>
            <dd><span v-if="row.colour" class="swatch" :style="{ background: row.colour }"></span>{{ row.value }}</dd>
          </template>
          <dt>Credit</dt>
          <dd>{{ item.credit }}</dd>
          <dt>Sent by</dt>
          <dd v-if="item.ownerName"><Icon :name="item.ownerProvider" :size="14" :title="providerLabel(item.ownerProvider)" />{{ item.ownerName }}</dd>
          <dd v-else>A deleted account</dd>
        </dl>
        <p v-if="item.notes" class="notes">{{ item.notes }}</p>
        <div v-if="client.image" class="upload-preview"><img :src="submissionFileUrl(item)" alt=""></div>
        <div class="buttons">
          <a class="button primary" :href="`/app/?${SUBMISSION_PARAM}=${item.id}`">Open in generator</a>
          <a v-if="item.pullUrl" class="button" :href="item.pullUrl" target="_blank" rel="noopener"><Icon name="github" :size="16" />Pull request</a>
        </div>
        <div v-if="changeable" class="buttons">
          <a class="button" :href="`${page}/edit`"><Icon name="pencil" :size="16" />Edit</a>
          <button type="button" class="danger" :disabled="busy" @click="withdraw"><Icon name="trash" :size="16" />Withdraw</button>
        </div>
        <p v-if="error" class="hint bad">{{ error }}</p>
        <ReviewPanel v-if="reviewer && item.status === 'open' && item.pullUrl" :key="item.updatedAt" :item="item" @done="reviewed" />
      </div>
    </div>
    <CommentThread :id="item.id" :comments="comments" :can-comment="item.mine || reviewer" @update="comments = $event" />
  </template>
</template>
