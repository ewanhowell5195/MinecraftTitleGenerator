<script setup>
  import { onMounted } from "vue"
  import { useRoute } from "vue-router"
  import { refreshAccount } from "../lib/state/account.js"
  import IssueView from "./IssueView.vue"
  import IssuesHome from "./IssuesHome.vue"

  const route = useRoute()
  const viewed = route.params.id ?? null

  onMounted(() => refreshAccount())
</script>

<template>
  <main class="page">
    <IssueView v-if="viewed" :id="Number(viewed)" />
    <IssuesHome v-else />
  </main>
</template>
