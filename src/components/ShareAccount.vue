<script setup>
  import { onMounted } from "vue"
  import { account, refreshAccount, signIn, signInProviders, signOut } from "../lib/community.js"
  import { providerLabel } from "../lib/providers.js"
  import Icon from "./Icon.vue"

  onMounted(() => refreshAccount())
</script>

<template>
  <div class="account">
    <template v-if="account">
      <p>Sharing as <strong :title="providerLabel(account.provider)"><Icon :name="account.provider" :size="14" />{{ account.name }}</strong>. Your username will show on this preset, and you can rename or delete it later. Sign out to share anonymously.</p>
      <div class="buttons">
        <button type="button" @click="signOut">Sign out</button>
      </div>
    </template>
    <template v-else-if="signInProviders.length">
      <p>Sign in to show your username on this preset and be able to rename or delete it later. Signing in also moves the presets saved in this browser to your account. Without an account it's shared anonymously and can't be edited or removed.</p>
      <div class="buttons">
        <button v-for="provider of signInProviders" :key="provider" type="button" @click="signIn(provider)"><Icon :name="provider" :size="16" /><span>Sign in with {{ providerLabel(provider) }}</span></button>
      </div>
    </template>
  </div>
</template>

<style scoped>
  .account {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  p {
    margin: 0;
    font-size: var(--font-md);
  }

  strong {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-weight: 600;
    vertical-align: bottom;
  }

  .buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  button {
    display: flex;
    align-items: center;
    gap: 8px;
    user-select: none;
  }
</style>
