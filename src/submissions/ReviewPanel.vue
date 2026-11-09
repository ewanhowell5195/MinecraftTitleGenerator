<script setup>
  import { onMounted, ref } from "vue"
  import Icon from "../components/Icon.vue"
  import { SUBMISSION_LIMITS } from "../lib/submissions.js"
  import { reviewState, reviewSubmission } from "../lib/submissionsApi.js"

  const props = defineProps({
    item: { type: Object, required: true }
  })

  const emit = defineEmits(["done"])

  const STATES = {
    clean: "Ready to merge.",
    behind: "Ready to merge.",
    has_hooks: "Ready to merge.",
    unstable: "Its checks are still running, or one has failed.",
    blocked: "GitHub is blocking the merge.",
    dirty: "It conflicts with main.",
    draft: "It's still a draft.",
    unknown: "GitHub is still checking it."
  }
  const READY = new Set(["clean", "behind", "has_hooks"])

  const state = ref(null)
  const declining = ref(false)
  const reason = ref("")
  const busy = ref(false)
  const error = ref("")

  async function check() {
    error.value = ""
    try {
      state.value = await reviewState(props.item.id)
    } catch (err) {
      error.value = err.message
    }
  }

  async function act(action) {
    if (action === "merge" && !confirm(`Merge ${props.item.name}? It's published in the generator.`)) return
    busy.value = true
    error.value = ""
    try {
      emit("done", await reviewSubmission(props.item.id, action, reason.value))
    } catch (err) {
      error.value = err.message
      await check()
    } finally {
      busy.value = false
    }
  }

  onMounted(check)
</script>

<template>
  <section class="review flow">
    <h2>Review</h2>
    <p class="hint">{{ state ? STATES[state] ?? `GitHub says it's ${state}.` : "Checking the pull request..." }} <button type="button" class="link-button" @click="check">Check again</button></p>
    <div v-if="!declining" class="buttons">
      <button type="button" class="primary" :disabled="busy || !READY.has(state)" @click="act('merge')"><Icon name="check" :size="16" />Merge</button>
      <button type="button" :disabled="busy" @click="declining = true"><Icon name="close" :size="16" />Decline</button>
    </div>
    <template v-else>
      <textarea v-model="reason" rows="3" :maxlength="SUBMISSION_LIMITS.comment" placeholder="Why it's declined (optional, shown to the submitter)" aria-label="Reason"></textarea>
      <div class="buttons">
        <button type="button" class="danger" :disabled="busy" @click="act('decline')">Decline</button>
        <button type="button" :disabled="busy" @click="declining = false">Cancel</button>
      </div>
    </template>
    <p v-if="error" class="hint bad">{{ error }}</p>
  </section>
</template>

<style scoped>
  .review {
    padding: 14px;
    background: var(--surface);
  }
</style>
