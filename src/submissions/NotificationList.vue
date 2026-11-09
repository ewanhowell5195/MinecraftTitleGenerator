<script setup>
  import { submissionPage } from "../lib/submissionsApi.js"

  defineProps({
    items: { type: Array, required: true },
    showSubmission: { type: Boolean, default: false }
  })

  const ACTIONS = {
    submitted: "sent",
    edited: "changed",
    comment: "commented on",
    changes: "asked for changes to",
    published: "published",
    rejected: "declined"
  }

  function when(time) {
    return new Date(time).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
  }
</script>

<template>
  <ul class="notifications">
    <li v-for="item of items" :key="item.id" :class="{ fresh: !item.seen }">
      <p class="headline">
        <strong>{{ item.author || "Someone" }}</strong> {{ ACTIONS[item.kind] }}
        <a v-if="showSubmission" :href="submissionPage(item.submission)">{{ item.submissionName }}</a>
        <template v-else>this submission</template>
        <span class="hint">{{ when(item.createdAt) }}</span>
      </p>
      <p v-if="item.body" class="body">{{ item.body }}</p>
      <a v-if="item.url" class="hint" :href="item.url" target="_blank" rel="noopener">View on GitHub</a>
    </li>
  </ul>
</template>
