<script setup>
  import { signIn, signInProviders } from "../lib/community.js"
  import { providerLabel } from "../lib/providers.js"
  import Button from "./Button.vue"
  import Icon from "./Icon.vue"
</script>

<template>
  <div v-if="signInProviders.length" class="buttons">
    <Button v-for="id of signInProviders" :key="id" @click="signIn(id)"><template #icon><Icon :name="id" :size="16" /></template>Sign in with {{ providerLabel(id) }}</Button>
  </div>
</template>
