<script setup>
  import { computed, ref } from "vue"
  import { account, signIn, signInProviders, signOut } from "../lib/community.js"
  import { useWindowEvents } from "../lib/events.js"
  import { providerLabel } from "../lib/providers.js"
  import ContextMenu from "./ContextMenu.vue"
  import Icon from "./Icon.vue"

  const REOPEN_DELAY = 300

  const at = ref(null)
  const items = computed(() => account.value ? [{ label: "Sign out", icon: "signOut", action: signOut }] : signInProviders.value.map(id => ({ label: `Sign in with ${providerLabel(id)}`, icon: id, action: () => signIn(id) })))
  let closedAt = -Infinity

  function holdEscape(event) {
    if (event.key === "Escape") event.preventDefault()
  }

  useWindowEvents(() => !!at.value, {}, { keydown: holdEscape })

  function show(event) {
    if (performance.now() - closedAt < REOPEN_DELAY) return
    const rect = event.currentTarget.getBoundingClientRect()
    at.value = { x: rect.left, y: rect.bottom + 4 }
  }

  function close() {
    closedAt = performance.now()
    at.value = null
  }
</script>

<template>
  <button v-if="account || signInProviders.length" class="account" :title="account ? `Signed in as ${account.name}` : 'Sign in to keep your presets on your account'" @click="show"><Icon :name="account ? account.provider : 'user'" :size="16" /><span>{{ account ? account.name : "Sign in" }}</span></button>
  <ContextMenu :items="at ? items : []" :at="at" @close="close" />
</template>

<style scoped>
  .account {
    display: flex;
    flex: none;
    align-items: center;
    gap: 6px;
    max-width: 200px;
    user-select: none;
  }

  span {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
</style>
