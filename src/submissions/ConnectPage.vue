<script setup>
  import { computed, ref } from "vue"
  import { useRoute } from "vue-router"
  import Button from "../components/Button.vue"
  import Notice from "../components/Notice.vue"
  import SignInButtons from "../components/SignInButtons.vue"
  import UserName from "../components/UserName.vue"
  import { connectCode, readConnect } from "../lib/core/connecting.js"
  import { account } from "../lib/state/account.js"
  import { connectBlockbench } from "../lib/state/connections.js"

  const { key, expired } = readConnect(useRoute().query)
  const code = computed(() => connectCode(key))
  const busy = ref(false)
  const error = ref("")
  const connected = ref(false)

  async function connect() {
    busy.value = true
    error.value = ""
    try {
      await connectBlockbench(key)
      connected.value = true
    } catch (err) {
      error.value = err.message
    } finally {
      busy.value = false
    }
  }
</script>

<template>
  <section class="intro">
    <h1>Connect Blockbench</h1>
    <p v-if="!key">To sign in from Blockbench, press Sign in in its Presets mode.</p>
    <p v-else-if="connected">Blockbench is connected. You can close this page and go back to Blockbench.</p>
    <p v-else-if="expired">This sign-in has expired. Press Sign in again in Blockbench.</p>
    <p v-else-if="account">Let Blockbench use your presets as <UserName :name="account.name" :provider="account.provider" />? It will be able to see, save, share, rename and delete your presets, and vote.</p>
    <p v-else>Sign in to connect Blockbench to your account.</p>
  </section>
  <SignInButtons v-if="key && !expired && !account" />
  <section v-else-if="key && !expired && !connected" class="section">
    <p class="hint">Only connect if you pressed Sign in in Blockbench, and it shows this code:</p>
    <p class="code">{{ code }}</p>
    <div class="buttons">
      <Button primary :disabled="busy" @click="connect">{{ busy ? "Connecting" : "Connect" }}</Button>
    </div>
    <Notice v-if="error">{{ error }}</Notice>
  </section>
</template>

<style scoped>
  p {
    margin: 0;
  }

  .code {
    font-size: 32px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.08em;
  }
</style>
