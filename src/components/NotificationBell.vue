<script setup>
  import { computed, nextTick, ref } from "vue"
  import { account } from "../lib/community.js"
  import { useWindowEvents } from "../lib/events.js"
  import { markNotificationsSeen, notifications, submissionPage } from "../lib/submissionsApi.js"
  import Icon from "./Icon.vue"

  const ACTIONS = {
    submitted: "sent",
    edited: "changed",
    comment: "commented on",
    changes: "asked for changes to",
    published: "published",
    rejected: "declined"
  }

  const button = ref(null)
  const panel = ref(null)
  const open = ref(false)
  const items = ref(null)
  const error = ref("")
  const position = ref({})

  const unread = computed(() => account.value?.unread ?? 0)
  const shown = computed(() => !!(account.value && (account.value.admin || account.value.submissions || unread.value)))

  function when(time) {
    return new Date(time).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
  }

  function place() {
    const rect = button.value.getBoundingClientRect()
    position.value = { top: `${rect.bottom + 8}px`, right: `${Math.max(8, innerWidth - rect.right)}px` }
  }

  async function load() {
    error.value = ""
    try {
      items.value = await notifications()
      if (items.value.some(item => !item.seen)) await markNotificationsSeen()
    } catch (err) {
      error.value = err.message
    }
  }

  async function toggle() {
    open.value = !open.value
    if (!open.value) return
    items.value = null
    place()
    await nextTick()
    load()
  }

  function close() {
    open.value = false
  }

  function outside(event) {
    if (!panel.value?.contains(event.target) && !button.value?.contains(event.target)) close()
  }

  function key(event) {
    if (event.key === "Escape") close()
  }

  useWindowEvents(() => open.value, { resize: close }, { pointerdown: outside, keydown: key })
</script>

<template>
  <div v-if="shown" class="notification-bell">
    <button ref="button" type="button" class="bell" :class="{ open }" :title="unread ? `${unread} unread notifications` : 'Notifications'" :aria-label="unread ? `Notifications, ${unread} unread` : 'Notifications'" :aria-expanded="open" @click="toggle">
      <Icon name="bell" :size="20" />
      <span v-if="unread" class="dot"></span>
    </button>
    <Teleport to="body">
      <div v-if="open" ref="panel" class="notification-panel popover" :style="position" role="dialog" aria-label="Notifications">
        <div class="panel-head">
          <strong>Notifications</strong>
          <a href="/submissions/">Submissions</a>
        </div>
        <p v-if="error" class="state bad">{{ error }}</p>
        <p v-else-if="!items" class="state">Loading...</p>
        <p v-else-if="!items.length" class="state">No notifications yet.</p>
        <ul v-else>
          <li v-for="item of items" :key="item.id" :class="{ fresh: !item.seen }">
            <a :href="submissionPage(item.submission)">
              <span class="line"><strong>{{ item.author || "Someone" }}</strong> {{ ACTIONS[item.kind] }} <span class="name">{{ item.submissionName }}</span></span>
              <span v-if="item.body" class="body">{{ item.body }}</span>
              <span class="when">{{ when(item.createdAt) }}</span>
            </a>
          </li>
        </ul>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
  .notification-bell {
    display: flex;
  }

  .bell {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    padding: 0;
    color: var(--muted);
    background: none;
    border: 0;
    cursor: pointer;
    user-select: none;
    transition: color var(--duration), background var(--duration);
  }

  .bell:hover,
  .bell.open {
    color: var(--text);
    background: var(--card);
  }

  .dot {
    position: absolute;
    top: 6px;
    right: 7px;
    width: 9px;
    height: 9px;
    background: var(--danger-fill);
    border: 2px solid var(--surface);
    border-radius: 50%;
  }

  .notification-panel {
    display: flex;
    flex-direction: column;
    width: min(360px, calc(100vw - 16px));
    max-height: min(480px, calc(100vh - 80px));
    font-family: system-ui, "Segoe UI", sans-serif;
    font-size: var(--font-base);
    line-height: 1.4;
    color: var(--text);
  }

  .panel-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 14px;
    border-bottom: 1px solid var(--line);
  }

  .panel-head a {
    font-size: var(--font-sm);
    color: var(--accent);
  }

  .state {
    margin: 0;
    padding: 16px 14px;
    color: var(--muted);
  }

  .state.bad {
    color: var(--danger);
  }

  ul {
    margin: 0;
    padding: 0;
    overflow-y: auto;
    list-style: none;
  }

  li + li {
    border-top: 1px solid var(--line);
  }

  li a {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 10px 14px;
    color: var(--muted);
    text-decoration: none;
    border-left: 3px solid transparent;
  }

  li a:hover {
    background: var(--card);
  }

  li.fresh a {
    border-left-color: var(--accent);
  }

  .line strong,
  .name {
    color: var(--text);
  }

  .name {
    font-weight: 600;
  }

  .body {
    display: -webkit-box;
    overflow: hidden;
    font-size: var(--font-sm);
    white-space: pre-wrap;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }

  .when {
    font-size: var(--font-xs);
    color: var(--faint);
  }
</style>
