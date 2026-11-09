<script setup>
  import { ref } from "vue"
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
  <section v-if="!comments || comments.length || canComment" class="section">
    <h2>Comments</h2>
    <p v-if="!comments" class="hint bad">The comments couldn't be loaded from GitHub right now.</p>
    <ul v-else-if="comments.length" class="notifications">
      <template v-for="item of comments" :key="item.id">
        <li v-if="item.kind === 'edit'" class="event">
          <p class="headline">
            <strong>{{ item.author || "Deleted account" }}</strong> changed the submission
            <span class="hint">{{ when(item.createdAt) }}</span>
          </p>
        </li>
        <li v-else>
          <p class="headline">
            <strong>{{ item.author || "Deleted account" }}</strong>
            <span class="role">{{ ROLES[item.role] }}</span>
            <span class="hint">{{ when(item.createdAt) }}</span>
          </p>
          <p class="body">{{ item.body }}</p>
          <a v-if="item.url" class="hint" :href="item.url" target="_blank" rel="noopener">View on GitHub</a>
        </li>
      </template>
    </ul>
    <form v-if="canComment" class="flow" @submit.prevent="send">
      <textarea v-model="text" rows="3" :maxlength="SUBMISSION_LIMITS.comment" placeholder="Write a comment" aria-label="Comment"></textarea>
      <div class="buttons">
        <button type="submit" class="primary" :disabled="busy || !text.trim()">Comment</button>
      </div>
      <p v-if="error" class="hint bad">{{ error }}</p>
    </form>
  </section>
</template>

<style scoped>
  .event {
    padding: 8px 12px;
    background: none;
    border-left-color: var(--line-strong);
  }

  .role {
    margin-left: 6px;
    padding: 1px 6px;
    font-size: var(--font-xs);
    font-weight: 600;
    color: var(--muted);
    background: var(--surface);
  }
</style>
