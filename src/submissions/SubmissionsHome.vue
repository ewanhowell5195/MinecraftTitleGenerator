<script setup>
  import { computed, ref, watch } from "vue"
  import Button from "../components/Button.vue"
  import Icon from "../components/Icon.vue"
  import { account, signIn, signInProviders } from "../lib/community.js"
  import { providerLabel } from "../lib/providers.js"
  import { mySubmissions, reviewQueue } from "../lib/submissionsApi.js"
  import Notice from "../components/Notice.vue"
  import SubmissionList from "./SubmissionList.vue"

  const props = defineProps({
    fonts: { type: Array, required: true }
  })

  const submissions = ref(null)
  const waiting = ref(null)
  const error = ref("")

  const empty = computed(() => !!submissions.value && !submissions.value.length && !waiting.value?.length)

  async function load() {
    submissions.value = null
    waiting.value = null
    error.value = ""
    if (!account.value) return
    try {
      const [mine, queue] = await Promise.all([mySubmissions(), account.value.admin ? reviewQueue() : null])
      submissions.value = mine
      waiting.value = queue
    } catch (err) {
      error.value = err.message
    }
  }

  watch(() => [account.value?.id, account.value?.admin], load, { immediate: true })
</script>

<template>
  <section class="intro heading">
    <div>
      <h1>Submissions</h1>
      <p>Follow the reviews of what you've sent to the title generator.</p>
    </div>
    <Button primary href="/submit/"><template #icon><Icon name="plus" :size="16" /></template>New submission</Button>
  </section>
  <template v-if="!account">
    <p class="hint">Sign in to see your submissions.</p>
    <div v-if="signInProviders.length" class="buttons">
      <Button v-for="id of signInProviders" :key="id" @click="signIn(id)"><template #icon><Icon :name="id" :size="16" /></template>Sign in with {{ providerLabel(id) }}</Button>
    </div>
  </template>
  <Notice v-else-if="error">{{ error }}</Notice>
  <p v-else-if="empty" class="hint">Nothing is waiting for review. <a href="/submit/">Send a submission</a>.</p>
  <section v-if="waiting?.length" class="section">
    <h2>Waiting for review</h2>
    <SubmissionList :items="waiting" :fonts="props.fonts" show-sender />
  </section>
  <section v-if="submissions?.length" class="section">
    <h2>Your submissions</h2>
    <SubmissionList :items="submissions" :fonts="props.fonts" />
  </section>
</template>

<style scoped>
  .heading {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    justify-content: space-between;
    gap: 16px;
  }
</style>
