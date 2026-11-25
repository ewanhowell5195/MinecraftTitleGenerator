<script setup>
  import { onMounted } from "vue"
  import { account, refreshAccount, signInProviders } from "#lib/state/account.js"
  import { SHARING_AS, withoutAccountText } from "#lib/presets/sharing.js"
  import SignInButtons from "#c/SignInButtons.vue"
  import UserName from "#c/UserName.vue"

  onMounted(() => refreshAccount())
</script>

<template>
  <div class="account">
    <template v-if="account">
      <p>Sharing as <strong><UserName :name="account.name" :provider="account.provider" /></strong>. {{ SHARING_AS }}</p>
    </template>
    <template v-else-if="signInProviders.length">
      <p v-for="line of withoutAccountText()" :key="line">{{ line }}</p>
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
</style>
