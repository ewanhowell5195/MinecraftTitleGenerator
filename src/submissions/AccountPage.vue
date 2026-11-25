<script setup>
  import { ref, watch } from "vue"
  import Button from "../components/Button.vue"
  import Icon from "../components/Icon.vue"
  import Notice from "../components/Notice.vue"
  import Dialog from "../components/Dialog.vue"
  import SignInButtons from "../components/SignInButtons.vue"
  import { account, deleteAccount } from "../lib/state/account.js"
  import { disconnectBlockbench, loadConnections } from "../lib/state/connections.js"
  import { providerLabel } from "../lib/core/providers.js"

  const choosing = ref(false)
  const busy = ref(false)
  const error = ref("")
  const deleted = ref(false)
  const connections = ref([])
  const connectionError = ref("")

  function shownDate(time) {
    return new Date(time).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
  }

  async function refreshConnections() {
    connectionError.value = ""
    try {
      connections.value = account.value ? await loadConnections() : []
    } catch (err) {
      connectionError.value = err.message
    }
  }

  async function disconnect({ id }) {
    try {
      await disconnectBlockbench(id)
      await refreshConnections()
    } catch (err) {
      connectionError.value = err.message
    }
  }

  watch(() => account.value?.id, refreshConnections, { immediate: !import.meta.env.SSR })

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
  <SignInButtons v-if="!account && !deleted" />
  <section v-if="account && (connections.length || connectionError)" class="section">
    <h2>Blockbench</h2>
    <p class="hint">Blockbench is connected to your account and can use your presets. Disconnecting signs it out.</p>
    <div v-for="connection of connections" :key="connection.id" class="connection">
      <span>Connected {{ shownDate(connection.createdAt) }}, last used {{ shownDate(connection.usedAt) }}</span>
      <Button @click="disconnect(connection)">Disconnect</Button>
    </div>
    <Notice v-if="connectionError">{{ connectionError }}</Notice>
  </section>
  <section v-if="account" class="section">
    <h2>Delete your account</h2>
    <p class="hint">Deleting your account always deletes the presets saved to it, your votes, and your notifications. To keep a copy of your presets, download them from the <a href="/app/presets">presets page</a> first.</p>
    <div class="buttons">
      <Button danger @click="open"><template #icon><Icon name="trash" :size="16" /></template>Delete account</Button>
    </div>
  </section>
  <Dialog v-if="choosing" title="Delete account" close-title="Cancel" wide dismissable @close="close">
    <div class="dialog-body">
      <p>Choose what happens to the presets you have shared and the things you have submitted or reported. This can't be undone.</p>
      <div class="choice">
        <p class="label">Keep them</p>
        <p class="hint">Your shared presets, submissions and reports stay on the title generator, without your username. Your shared presets keep their votes, ratings and downloads.</p>
        <Button danger :disabled="busy" @click="remove('anonymise')"><template #icon><Icon name="trash" :size="16" /></template>Delete account and keep them</Button>
      </div>
      <div class="choice">
        <p class="label">Remove them</p>
        <p class="hint">Your shared presets and reports are deleted, and your submissions waiting for review are withdrawn. Submissions already added to the title generator stay, as the <a href="/terms/" target="_blank" rel="noopener">Terms of Service</a> allow.</p>
        <Button danger :disabled="busy" @click="remove('remove')"><template #icon><Icon name="trash" :size="16" /></template>Delete account and remove them</Button>
      </div>
      <Notice v-if="error">{{ error }}</Notice>
    </div>
  </Dialog>
</template>

<style scoped>
  .connection {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 8px 16px;
    max-width: 560px;
  }

  .choice {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
    padding: 14px;
    border: 1px solid var(--line);
  }
</style>
