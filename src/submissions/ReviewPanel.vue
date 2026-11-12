<script setup>
  import { computed, onMounted, ref } from "vue"
  import Button from "../components/Button.vue"
  import Icon from "../components/Icon.vue"
  import Notice from "../components/Notice.vue"
  import { SUBMISSION_LIMITS } from "../lib/submissions.js"
  import { reviewState, reviewSubmission } from "../lib/submissionsApi.js"

  const props = defineProps({
    item: { type: Object, required: true },
    failedUrl: { type: String, default: "" }
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
  const failed = computed(() => !!props.failedUrl && !READY.has(state.value))
  const status = computed(() => state.value ? STATES[state.value] ?? `GitHub says it's ${state.value}.` : "Checking the pull request...")
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
      await check()
      error.value = err.message
    } finally {
      busy.value = false
    }
  }

  onMounted(check)
</script>

<template>
  <section class="review" :class="{ ready: READY.has(state), failed }">
    <div class="summary">
      <h2>Review this submission</h2>
      <p class="hint"><template v-if="failed">Processing it failed on GitHub. <a :href="failedUrl" target="_blank" rel="noopener">See what went wrong</a>.</template><template v-else>{{ status }}</template> <button type="button" class="link-button" @click="check">Check again</button></p>
    </div>
    <div v-if="!declining" class="buttons">
      <Button primary :disabled="busy || !READY.has(state)" @click="act('merge')"><template #icon><Icon name="check" :size="16" /></template>Merge</Button>
      <Button :disabled="busy" @click="declining = true"><template #icon><Icon name="close" :size="16" /></template>Decline</Button>
    </div>
    <div v-else class="decline">
      <textarea v-model="reason" rows="3" :maxlength="SUBMISSION_LIMITS.comment" placeholder="Why it's declined (optional, shown to the submitter)" aria-label="Reason"></textarea>
      <div class="buttons">
        <Button danger :disabled="busy" @click="act('decline')">Decline</Button>
        <Button :disabled="busy" @click="declining = false">Cancel</Button>
      </div>
    </div>
    <Notice v-if="error">{{ error }}</Notice>
  </section>
</template>

<style scoped>
  .review {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px 24px;
    padding: 18px 20px;
    background: var(--surface);
    border-left: 4px solid var(--muted);
  }

  .review.ready {
    border-left-color: var(--accent);
  }

  .review.failed {
    border-left-color: var(--danger-fill);
  }

  .summary {
    flex: 1 1 280px;
  }

  .summary h2 {
    margin: 0 0 4px;
    font-size: 20px;
  }

  .summary p {
    margin: 0;
  }

  .decline {
    display: flex;
    flex-direction: column;
    gap: 8px;
    flex: 1 1 100%;
  }

  .review > .notice {
    flex: 1 1 100%;
  }
</style>
