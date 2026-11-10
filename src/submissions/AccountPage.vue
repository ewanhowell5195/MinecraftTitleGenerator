<script setup>
  import { ref } from "vue"
  import Button from "../components/Button.vue"
  import Icon from "../components/Icon.vue"
  import RenderDialog from "../components/RenderDialog.vue"
  import { account, deleteAccount, signIn, signInProviders } from "../lib/community.js"
  import { providerLabel } from "../lib/providers.js"

  const choosing = ref(false)
  const busy = ref(false)
  const error = ref("")
  const deleted = ref(false)

  function open() {
    error.value = ""
    choosing.value = true
  }

  function close() {
    if (!busy.value) choosing.value = false
  }

  async function remove(mode) {
    busy.value = true
    error.value = ""
    try {
      await deleteAccount(mode)
      deleted.value = true
      choosing.value = false
    } catch (err) {
      error.value = err.message
    } finally {
      busy.value = false
    }
  }
</script>

<template>
  <section class="intro">
    <h1>Manage account</h1>
    <p v-if="deleted">Your account has been deleted.</p>
    <p v-else-if="account">Signed in as {{ account.name }} with {{ providerLabel(account.provider) }}.</p>
    <p v-else>Sign in to manage your account.</p>
  </section>
  <div v-if="!account && !deleted && signInProviders.length" class="buttons">
    <Button v-for="id of signInProviders" :key="id" @click="signIn(id)"><template #icon><Icon :name="id" :size="16" /></template>Sign in with {{ providerLabel(id) }}</Button>
  </div>
  <section v-if="account" class="section">
    <h2>Delete your account</h2>
    <p class="hint">Deleting your account always deletes the presets saved to it, your votes, and your notifications. To keep a copy of your presets, download them from the <a href="/app/presets">presets page</a> first.</p>
    <div class="buttons">
      <Button danger @click="open"><template #icon><Icon name="trash" :size="16" /></template>Delete account</Button>
    </div>
  </section>
  <RenderDialog v-if="choosing" title="Delete account" close-title="Cancel" wide dismissable @close="close">
    <div class="dialog-body">
      <p>Choose what happens to the presets you have shared and the things you have submitted. This can't be undone.</p>
      <div class="choice">
        <p class="label">Keep them</p>
        <p class="hint">Your shared presets and submissions stay, without your username. Your shared presets keep their votes, ratings and downloads.</p>
        <Button danger :disabled="busy" @click="remove('anonymise')"><template #icon><Icon name="trash" :size="16" /></template>Delete account and keep them</Button>
      </div>
      <div class="choice">
        <p class="label">Remove them</p>
        <p class="hint">Your shared presets are deleted, and your submissions waiting for review are withdrawn. Submissions already added to the title generator stay, as the <a href="/terms/" target="_blank" rel="noopener">Terms of Service</a> allow.</p>
        <Button danger :disabled="busy" @click="remove('remove')"><template #icon><Icon name="trash" :size="16" /></template>Delete account and remove them</Button>
      </div>
      <p v-if="error" class="error">{{ error }}</p>
    </div>
  </RenderDialog>
</template>

<style scoped>
  .choice {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
    padding: 14px;
    border: 1px solid var(--line);
  }
</style>
