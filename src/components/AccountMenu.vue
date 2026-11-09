<script setup>
  import { computed, onMounted, ref } from "vue"
  import { account, refreshAccount, signIn, signInProviders, signOut } from "../lib/community.js"
  import { providerLabel } from "../lib/providers.js"
  import Icon from "./Icon.vue"
  import MenuButton from "./MenuButton.vue"

  const broken = ref(null)
  const unread = computed(() => account.value?.unread ?? 0)
  const avatar = computed(() => account.value?.avatar && account.value.avatar !== broken.value ? account.value.avatar : null)
  onMounted(() => refreshAccount())

  const hasSubmissions = computed(() => !!(account.value?.admin || account.value?.submissions || unread.value))
  const items = computed(() => account.value ? [{ heading: true, label: `Signed in as ${account.value.name}` }].concat(hasSubmissions.value ? { label: unread.value ? `Submissions (${unread.value} new)` : "Submissions", icon: "upload", action: () => location.assign("/submissions/") } : [], { label: "Manage account", icon: "user", action: () => location.assign("/account/") }, { label: "Sign out", icon: "signOut", action: signOut }) : signInProviders.value.map(id => ({ label: `Sign in with ${providerLabel(id)}`, icon: id, action: () => signIn(id) })))
</script>

<template>
  <MenuButton v-if="account || signInProviders.length" class="account" :class="{ signed: account }" :items="items" end :title="account ? `Signed in as ${account.name} with ${providerLabel(account.provider)}` : 'Sign in to keep your presets under your account'" :aria-label="account ? `Account: ${account.name}` : 'Sign in'">
    <template v-if="account">
      <img v-if="avatar" class="avatar" :src="avatar" alt="" width="28" height="28" referrerpolicy="no-referrer" @error="broken = avatar">
      <span v-else class="avatar fallback"><Icon :name="account.provider" :size="16" /></span>
      <span v-if="unread" class="unread" :title="`${unread} new on your submissions`">{{ unread }}</span>
    </template>
    <template v-else><Icon name="user" :size="16" /><span>Sign in</span></template>
  </MenuButton>
</template>

<style scoped>
  .account {
    position: relative;
    flex: none;
    gap: 6px;
  }

  .account.signed {
    padding: 0;
    background: none;
    border: 0;
    cursor: pointer;
  }

  .avatar {
    display: block;
    width: 32px;
    height: 32px;
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

  .unread {
    position: absolute;
    top: -6px;
    right: -6px;
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
