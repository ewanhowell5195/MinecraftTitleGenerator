<script setup>
  import Badge from "../components/Badge.vue"
  import UserName from "../components/UserName.vue"
  import { dateTime } from "../lib/core/dates.js"
  import { ISSUE_STATUSES } from "../lib/issues/issues.js"
  import { issuePage } from "../lib/issues/issuesApi.js"

  defineProps({
    items: { type: Array, required: true },
    showReporter: { type: Boolean, default: false }
  })
</script>

<template>
  <ul class="issue-list">
    <li v-for="item of items" :key="item.id">
      <a :href="issuePage(item.id)">
        <span class="title ellipsis">{{ item.title }}</span>
        <Badge :tone="item.status === 'open' ? 'accent' : 'neutral'">{{ ISSUE_STATUSES[item.status] }}</Badge>
        <span class="meta"><template v-if="showReporter">By <UserName v-if="item.ownerName" :name="item.ownerName" :provider="item.ownerProvider" /><template v-else>a deleted account</template>, </template>{{ dateTime(item.createdAt) }}</span>
      </a>
    </li>
  </ul>
</template>

<style scoped>
  .issue-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  a {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 4px 12px;
    padding: 12px 16px;
    color: var(--text);
    text-decoration: none;
    background: var(--card);
    transition: background var(--duration);
  }

  a:hover {
    background: var(--card-hover);
  }

  .title {
    font-weight: 600;
  }

  .meta {
    grid-column: 1 / -1;
    font-size: var(--font-sm);
    color: var(--faint);
  }
</style>
