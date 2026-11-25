<script setup>
  import { computed, onMounted, ref, watch } from "vue"
  import Badge from "../components/Badge.vue"
  import Button from "../components/Button.vue"
  import Icon from "../components/Icon.vue"
  import Notice from "../components/Notice.vue"
  import SignInButtons from "../components/SignInButtons.vue"
  import UserName from "../components/UserName.vue"
  import { dateTime } from "../lib/core/dates.js"
  import { ISSUE_STATUSES } from "../lib/issues/issues.js"
  import { changeIssueStatus, issueThread, markIssueSeen, postIssueComment } from "../lib/issues/issuesApi.js"
  import { account } from "../lib/state/account.js"
  import { askConfirm } from "../lib/state/confirm.js"
  import { notifications } from "../lib/submissions/submissionsApi.js"
  import CommentThread from "../submissions/CommentThread.vue"

  const props = defineProps({
    id: { type: Number, required: true }
  })

  const item = ref(null)
  const comments = ref([])
  const error = ref("")

  const RESOLVE = { status: "fixed", icon: "check", label: "Resolve", written: "Resolve with comment" }
  const DISMISS = { status: "closed", icon: "close", label: "Not planned", written: "Not planned with comment" }
  const WITHDRAW = { status: "withdrawn", icon: "check", label: "Close report", written: "Close with comment" }
  const REOPEN = { status: "open", icon: "undo", label: "Reopen", written: "Reopen with comment" }

  const changes = computed(() => {
    const open = item.value.status === "open"
    if (account.value?.admin) return open ? [DISMISS, RESOLVE] : [REOPEN]
    return open && item.value.mine ? [WITHDRAW] : []
  })
  const images = computed(() => item.value?.files.filter(file => file.kind === "image") ?? [])
  const titleFile = computed(() => item.value?.files.find(file => file.kind === "title") ?? null)

  async function load() {
    error.value = ""
    try {
      const thread = await issueThread(props.id)
      item.value = thread.issue
      comments.value = thread.comments
    } catch (err) {
      error.value = err.message
    }
  }

  async function markSeen() {
    if (!item.value || !account.value) return
    if ((await notifications()).some(entry => entry.issue === props.id && !entry.seen)) await markIssueSeen(props.id)
  }

  async function change({ status }, submit) {
    if (status === "withdrawn" && !await askConfirm({ title: "Close report", message: `Close "${item.value.title}"? Do this if it's fixed for you or no longer needed.`, action: "Close report" })) return
    await submit(async comment => {
      const changed = await changeIssueStatus(props.id, status, comment)
      item.value = changed.issue
      comments.value = changed.comments
    })
  }

  onMounted(load)
  watch(() => account.value?.id, load)
  watch(() => [item.value?.id, account.value?.id], () => markSeen().catch(err => console.error(err)))
  watch(() => item.value?.title, title => {
    if (title) document.title = `${title} | Reports | Minecraft Title Generator`
  })
</script>

<template>
  <Notice v-if="error && !item">{{ error }}</Notice>
  <template v-else-if="item">
    <section class="intro">
      <a class="hint" href="/issues/">Reports</a>
      <h1>{{ item.title }}</h1>
      <p class="meta">
        <Badge :tone="item.status === 'open' ? 'accent' : 'neutral'">{{ ISSUE_STATUSES[item.status] }}</Badge>
        <span>Reported by <UserName v-if="item.ownerName" :name="item.ownerName" :provider="item.ownerProvider" /><template v-else>a deleted account</template>, {{ dateTime(item.createdAt) }}</span>
      </p>
      <blockquote class="notes">{{ item.body }}</blockquote>
      <ul v-if="images.length" v-popupable-group="images.length > 1 && { counter: true, thumbnails: true }" class="images">
        <li v-for="(image, index) of images" :key="image.url">
          <a :href="image.url" target="_blank" rel="noopener"><img v-popupable="{ zoomable: true }" :src="image.url" :alt="`Image ${index + 1}`" @click.prevent></a>
        </li>
      </ul>
    </section>
    <div class="actions">
      <Button v-if="item.titleLink" primary :href="item.titleLink"><template #icon><Icon name="link" :size="16" /></template>Open the title</Button>
      <Button v-if="titleFile" :href="titleFile.page" target="_blank" rel="noopener"><template #icon><Icon name="download" :size="16" /></template>Title file</Button>
      <Button v-if="item.issueUrl" :href="item.issueUrl" target="_blank" rel="noopener"><template #icon><Icon name="github" :size="16" /></template>GitHub issue</Button>
    </div>
    <Notice v-if="error">{{ error }}</Notice>
    <section class="section">
      <h2>Comments</h2>
      <CommentThread :id="item.id" :comments="comments" :can-comment="!!account" :post="postIssueComment" @update="comments = $event">
        <template #actions="{ written, busy, submit }">
          <Button v-for="option of changes" :key="option.status" :disabled="busy" @click="change(option, submit)"><template #icon><Icon :name="option.icon" :size="16" /></template>{{ written ? option.written : option.label }}</Button>
        </template>
      </CommentThread>
      <template v-if="!account">
        <p class="hint">Sign in to comment.</p>
        <SignInButtons />
      </template>
    </section>
  </template>
</template>

<style scoped>
  .meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }

  .notes {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .images {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: 8px;
    margin: 16px 0 0;
    padding: 0;
    list-style: none;
  }

  .images a {
    display: block;
  }

  .images img {
    display: block;
    width: 100%;
    aspect-ratio: 16 / 10;
    object-fit: contain;
    background: var(--checker);
  }
</style>
