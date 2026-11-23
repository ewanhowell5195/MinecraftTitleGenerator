<script setup>
  import { computed, ref, watch } from "vue"
  import Button from "../components/Button.vue"
  import Icon from "../components/Icon.vue"
  import Notice from "../components/Notice.vue"
  import SignInButtons from "../components/SignInButtons.vue"
  import { account } from "../lib/state/account.js"
  import { REPORT_PARAM, myIssues, openIssues } from "../lib/issues/issuesApi.js"
  import IssueList from "./IssueList.vue"

  const issues = ref(null)
  const waiting = ref(null)
  const error = ref("")

  const empty = computed(() => !!issues.value && !issues.value.length && !waiting.value?.length)

  async function load() {
    issues.value = null
    waiting.value = null
    error.value = ""
    if (!account.value) return
    try {
      const [mine, open] = await Promise.all([myIssues(), account.value.admin ? openIssues() : null])
      issues.value = mine
      waiting.value = open
    } catch (err) {
      error.value = err.message
    }
  }

  watch(() => [account.value?.id, account.value?.admin], load, { immediate: true })
</script>

<template>
  <section class="intro heading">
    <div>
      <h1>Reports</h1>
      <p>Follow the issues you've reported with the title generator.</p>
    </div>
    <Button primary :href="`/app/?${REPORT_PARAM}`"><template #icon><Icon name="bug" :size="16" /></template>Report an issue</Button>
  </section>
  <template v-if="!account">
    <p class="hint">Sign in to see your reports.</p>
    <SignInButtons />
  </template>
  <Notice v-else-if="error">{{ error }}</Notice>
  <p v-else-if="empty" class="hint">You haven't reported anything yet.</p>
  <section v-if="waiting?.length" class="section">
    <h2>Open reports</h2>
    <IssueList :items="waiting" show-reporter />
  </section>
  <section v-if="issues?.length" class="section">
    <h2>Your reports</h2>
    <IssueList :items="issues" />
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
