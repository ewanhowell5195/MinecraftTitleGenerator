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
  import { closeIssue, issueThread, markIssueSeen, postIssueComment } from "../lib/issues/issuesApi.js"
  import { account } from "../lib/state/account.js"
  import { askConfirm } from "../lib/state/confirm.js"
  import { notifications } from "../lib/submissions/submissionsApi.js"
  import CommentThread from "../submissions/CommentThread.vue"

  const props = defineProps({
    id: { type: Number, required: true }
  })

  const item = ref(null)
  const comments = ref([])
  const reviewer = ref(false)
  const error = ref("")
  const busy = ref(false)

  const closable = computed(() => item.value?.mine && item.value.status === "open")
  const images = computed(() => item.value?.files.filter(file => file.kind === "image") ?? [])
  const titleFile = computed(() => item.value?.files.find(file => file.kind === "title") ?? null)

  async function load() {
    error.value = ""
    if (!account.value) return
    try {
      const thread = await issueThread(props.id)
      item.value = thread.issue
      comments.value = thread.comments
      reviewer.value = thread.reviewer
    } catch (err) {
      error.value = err.message
    }
  }

  async function markSeen() {
    if (!item.value) return
    if ((await notifications()).some(entry => entry.issue === props.id && !entry.seen)) await markIssueSeen(props.id)
  }

  async function close() {
    if (!await askConfirm({ title: "Close report", message: `Close "${item.value.title}"? Do this if it's fixed for you or no longer needed.`, action: "Close report" })) return
    busy.value = true
    error.value = ""
    try {
      item.value = await closeIssue(props.id)
    } catch (err) {
      error.value = err.message
    } finally {
      busy.value = false
    }
  }

  onMounted(load)
  watch(() => account.value?.id, load)
  watch(() => [item.value?.id, account.value?.id], () => markSeen().catch(err => console.error(err)))
  watch(() => item.value?.title, title => {
    if (title) document.title = `${title} | Reports | Minecraft Title Generator`
  })
</script>

<template>
  <template v-if="!account">
    <section class="intro">
      <a class="hint" href="/issues/">Reports</a>
      <h1>Sign in to see this report</h1>
    </section>
    <SignInButtons />
  </template>
  <Notice v-else-if="error && !item">{{ error }}</Notice>
  <template v-else-if="item">
    <section class="intro">
      <a class="hint" href="/issues/">Reports</a>
      <h1>{{ item.title }}</h1>
      <p class="meta">
        <Badge :tone="item.status === 'open' ? 'accent' : 'neutral'">{{ ISSUE_STATUSES[item.status] }}</Badge>
        <span>Reported by <UserName v-if="item.ownerName" :name="item.ownerName" :provider="item.ownerProvider" /><template v-else>a deleted account</template>, {{ dateTime(item.createdAt) }}</span>
      </p>
      <blockquote class="notes">{{ item.body }}</blockquote>
      <ul v-if="images.length" class="images">
        <li v-for="(image, index) of images" :key="image.url">
          <a :href="image.url" target="_blank" rel="noopener"><img :src="image.url" :alt="`Image ${index + 1}`"></a>
        </li>
      </ul>
    </section>
    <div class="actions">
      <Button v-if="item.titleLink" primary :href="item.titleLink"><template #icon><Icon name="link" :size="16" /></template>Open the title</Button>
      <Button v-if="titleFile" :href="titleFile.page" target="_blank" rel="noopener"><template #icon><Icon name="download" :size="16" /></template>Title file</Button>
      <Button v-if="item.issueUrl" :href="item.issueUrl" target="_blank" rel="noopener"><template #icon><Icon name="github" :size="16" /></template>GitHub issue</Button>
      <Button v-if="closable" :disabled="busy" @click="close"><template #icon><Icon name="check" :size="16" /></template>Close report</Button>
    </div>
    <Notice v-if="error">{{ error }}</Notice>
    <section class="section">
      <h2>Comments</h2>
      <CommentThread :id="item.id" :comments="comments" :can-comment="item.mine || reviewer" :post="postIssueComment" @update="comments = $event" />
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
    aspect-ratio: 16 / 10;
    background: var(--card);
  }

  .images img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
</style>
