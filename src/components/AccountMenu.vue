<script setup>
  import { computed } from "vue"
  import { account, signIn, signInProviders, signOut } from "../lib/community.js"
  import { providerLabel } from "../lib/providers.js"
  import Icon from "./Icon.vue"
  import MenuButton from "./MenuButton.vue"

  const items = computed(() => account.value ? [{ label: "Sign out", icon: "signOut", action: signOut }] : signInProviders.value.map(id => ({ label: `Sign in with ${providerLabel(id)}`, icon: id, action: () => signIn(id) })))
</script>

<template>
  <MenuButton v-if="account || signInProviders.length" class="account" :items="items" :title="account ? `Signed in as ${account.name}` : 'Sign in to keep your presets on your account'"><Icon :name="account ? account.provider : 'user'" :size="16" /><span class="ellipsis">{{ account ? account.name : "Sign in" }}</span></MenuButton>
</template>

<style scoped>
  .account {
    flex: none;
    gap: 6px;
    max-width: 200px;
  }
</style>
