<script setup>
  import { computed } from "vue"
  import { account, signIn, signInProviders, signOut } from "../lib/community.js"
  import { providerLabel } from "../lib/providers.js"
  import Icon from "./Icon.vue"
  import MenuButton from "./MenuButton.vue"

  const unread = computed(() => account.value?.unread ?? 0)
  const items = computed(() => account.value ? [{ label: unread.value ? `Submissions (${unread.value} new)` : "Submissions", icon: "upload", action: () => location.assign("/submit/") }, { label: "Sign out", icon: "signOut", action: signOut }] : signInProviders.value.map(id => ({ label: `Sign in with ${providerLabel(id)}`, icon: id, action: () => signIn(id) })))
</script>

<template>
  <MenuButton v-if="account || signInProviders.length" class="account" :items="items" :title="account ? `Signed in as ${account.name}` : 'Sign in to keep your presets on your account'"><Icon :name="account ? account.provider : 'user'" :size="16" /><span class="ellipsis">{{ account ? account.name : "Sign in" }}</span><span v-if="unread" class="unread" :title="`${unread} new on your submissions`">{{ unread }}</span></MenuButton>
</template>

<style scoped>
  .account {
    flex: none;
    gap: 6px;
    max-width: 200px;
  }

  .unread {
    flex: none;
    min-width: 18px;
    padding: 0 5px;
    font-size: var(--font-xs);
    font-weight: 700;
    line-height: 18px;
    text-align: center;
    color: var(--accent-text);
    background: var(--accent);
    border-radius: 9px;
  }
</style>
