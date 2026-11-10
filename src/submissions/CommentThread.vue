<script setup>
  import { ref } from "vue"
  import Button from "../components/Button.vue"
  import Icon from "../components/Icon.vue"
  import Notice from "../components/Notice.vue"
  import { SUBMISSION_LIMITS } from "../lib/submissions.js"
  import { postComment } from "../lib/submissionsApi.js"

  const props = defineProps({
    id: { type: Number, required: true },
    comments: { type: Array, default: null },
    canComment: { type: Boolean, default: false }
  })

  const emit = defineEmits(["update"])

  const ROLES = { submitter: "Submitter", reviewer: "Reviewer" }

  const text = ref("")
  const busy = ref(false)
  const error = ref("")

  function when(time) {
    return new Date(time).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
  }

  async function send() {
    busy.value = true
    error.value = ""
    try {
      emit("update", await postComment(props.id, text.value))
      text.value = ""
    } catch (err) {
      error.value = err.message
    } finally {
      busy.value = false
    }
  }
</script>

<template>
  <div class="comments">
    <Notice v-if="!comments">The comments couldn't be loaded from GitHub right now.</Notice>
    <p v-else-if="!comments.length && !canComment" class="hint">No comments yet.</p>
    <ol v-else-if="comments.length" class="thread">
      <template v-for="item of comments" :key="item.id">
        <li v-if="item.kind === 'edit'" class="event">
          <span class="marker"><Icon name="pencil" :size="14" /></span>
          <p><strong>{{ item.author || "A deleted account" }}</strong> changed the submission <time>{{ when(item.createdAt) }}</time></p>
        </li>
        <li v-else class="comment" :class="item.role">
          <span class="marker">{{ (item.author || "?")[0].toUpperCase() }}</span>
          <article>
            <header>
              <strong class="ellipsis">{{ item.author || "A deleted account" }}</strong>
              <span class="role">{{ ROLES[item.role] }}</span>
              <time>{{ when(item.createdAt) }}</time>
              <a v-if="item.url" class="github" :href="item.url" target="_blank" rel="noopener" v-tooltip="'View on GitHub'" aria-label="View on GitHub"><Icon name="github" :size="16" /></a>
            </header>
            <p>{{ item.body }}</p>
          </article>
        </li>
      </template>
    </ol>
    <form v-if="canComment" class="composer" @submit.prevent="send">
      <textarea v-model="text" rows="2" :maxlength="SUBMISSION_LIMITS.comment" placeholder="Write a comment" aria-label="Comment"></textarea>
      <Button primary type="submit" :disabled="busy || !text.trim()">Comment</Button>
    </form>
    <Notice v-if="canComment && error">{{ error }}</Notice>
  </div>
</template>

<style scoped>
  .comments {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .thread {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .thread li:not(:last-child)::before {
    content: "";
    position: absolute;
    top: 32px;
    bottom: -12px;
    left: 15px;
    width: 2px;
    background: var(--line);
  }

  .thread li {
    position: relative;
    display: grid;
    grid-template-columns: 32px minmax(0, 1fr);
    align-items: start;
    gap: 12px;
  }

  .marker {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    font-weight: 700;
    color: var(--muted);
    background: var(--card);
    border: 2px solid var(--bg);
  }

  .reviewer .marker {
    color: var(--accent);
    background: linear-gradient(var(--accent-soft) 0 0), var(--card);
  }

  article {
    padding: 12px 16px 14px;
    background: var(--card);
  }

  header {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    margin-bottom: 6px;
  }

  .role {
    flex: none;
    padding: 1px 6px;
    font-size: var(--font-xs);
    font-weight: 600;
    color: var(--muted);
    background: var(--surface);
  }

  .reviewer .role {
    color: var(--accent);
    background: var(--accent-soft);
  }

  time {
    flex: none;
    font-size: var(--font-sm);
    color: var(--faint);
  }

  .github {
    display: flex;
    margin-left: auto;
    color: var(--faint);
  }

  .github:hover {
    color: var(--text);
  }

  article p {
    margin: 0;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .event {
    align-items: center;
  }

  .event .marker {
    color: var(--faint);
    background: var(--surface);
  }

  .event p {
    margin: 0;
    font-size: var(--font-md);
    color: var(--faint);
  }

  .event strong {
    color: var(--muted);
  }

  .event time {
    margin-left: 6px;
  }

  .composer {
    display: flex;
    align-items: flex-end;
    gap: 8px;
    padding-right: 8px;
    background: var(--card);
    border: 1px solid transparent;
  }

  .composer:focus-within {
    border-color: var(--accent);
  }

  .composer textarea,
  .composer textarea:focus {
    flex: 1;
    min-height: 64px;
    background: none;
    border: none;
  }

  .composer button {
    flex: none;
    margin-bottom: 8px;
  }
</style>
