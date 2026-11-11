<script setup>
  import { onMounted } from "vue"
  import { account, refreshAccount, signInProviders } from "../lib/community.js"
  import SignInButtons from "./SignInButtons.vue"
  import UserName from "./UserName.vue"

  onMounted(() => refreshAccount())
</script>

<template>
  <div class="account">
    <template v-if="account">
      <p>Sharing as <strong><UserName :name="account.name" :provider="account.provider" /></strong>. Your username will show on this preset, and you can rename or delete it later.</p>
    </template>
    <template v-else-if="signInProviders.length">
      <p>Sign in to show your username on this preset and manage it from any device. Without an account, you can only rename or delete it from this browser, and you lose that if this browser's saved data is cleared.</p>
      <p>Signing in on this browser later moves your saved presets and everything shared from it to your account, with your username showing on them.</p>
      <SignInButtons />
    </template>
  </div>
</template>

<style scoped>
  .account {
    display: flex;
    flex-direction: column;
    gap: 8px;
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
</style>
