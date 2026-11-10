<script setup>
  import { computed, onMounted, ref } from "vue"
  import { account, refreshAccount, signIn, signInProviders, signOut } from "../lib/community.js"
  import { providerLabel } from "../lib/providers.js"
  import { router } from "../router.js"
  import Icon from "./Icon.vue"
  import MenuButton from "./MenuButton.vue"

  const broken = ref(null)
  const avatar = computed(() => account.value?.avatar && account.value.avatar !== broken.value ? account.value.avatar : null)
  onMounted(() => refreshAccount())

  const hasSubmissions = computed(() => !!(account.value?.submissions || account.value?.waiting))
  const items = computed(() => account.value ? [{ heading: true, label: `Signed in as ${account.value.name}` }].concat(hasSubmissions.value ? { label: "Submissions", icon: "upload", action: () => router.push("/submissions/") } : [], { label: "Manage account", icon: "user", action: () => router.push("/account/") }, { label: "Sign out", icon: "signOut", action: signOut }) : signInProviders.value.map(id => ({ label: `Sign in with ${providerLabel(id)}`, icon: id, action: () => signIn(id) })))
</script>

<template>
  <MenuButton v-if="account || signInProviders.length" class="account" :class="{ signed: account }" :items="items" end v-tooltip="account ? `Signed in as ${account.name} with ${providerLabel(account.provider)}` : 'Sign in to keep your presets under your account'" :aria-label="account ? `Account: ${account.name}` : 'Sign in'">
    <template v-if="account">
      <img v-if="avatar" class="avatar" :src="avatar" alt="" width="28" height="28" referrerpolicy="no-referrer" @error="broken = avatar">
      <span v-else class="avatar fallback"><Icon :name="account.provider" :size="16" /></span>
    </template>
    <template v-else><Icon name="user" :size="16" /><span>Sign in</span></template>
  </MenuButton>
</template>

<style scoped>
  .account {
    flex: none;
  }

  .account.signed {
    padding: 0;
    background: none;
    box-shadow: none;
    filter: none;
  }

  .avatar {
    display: block;
    width: var(--control);
    height: var(--control);
    outline: 2px solid transparent;
    transition: outline-color var(--duration);
  }

  .account.signed:hover .avatar {
    outline-color: var(--line-strong);
  }

  .fallback {
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text);
    background: var(--card);
  }
</style>
