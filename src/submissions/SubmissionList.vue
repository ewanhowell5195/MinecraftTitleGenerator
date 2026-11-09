<script setup>
  import { SUBMISSION_STATUSES } from "../lib/submissions.js"
  import { submissionFileUrl, submissionPage } from "../lib/submissionsApi.js"
  import { CLIENT_KINDS } from "./kinds/index.js"

  defineProps({
    items: { type: Array, required: true },
    fonts: { type: Array, required: true },
    showSender: { type: Boolean, default: false }
  })
</script>

<template>
  <ul class="submission-list">
    <li v-for="item of items" :key="item.id">
      <a :href="submissionPage(item.id)">
        <img v-if="CLIENT_KINDS[item.kind].image" :src="submissionFileUrl(item)" alt="" loading="lazy">
        <span class="name">{{ item.name }}</span>
        <span class="where">{{ CLIENT_KINDS[item.kind].summary(item, fonts) }}</span>
        <span v-if="showSender" class="where">Sent by {{ item.ownerName || "a deleted account" }}</span>
        <span class="status" :class="item.status">{{ SUBMISSION_STATUSES[item.status] }}</span>
      </a>
    </li>
  </ul>
</template>
