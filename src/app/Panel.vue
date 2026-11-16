<script setup>
  import Button from "../components/Button.vue"
  import ToggleSwitch from "../components/ToggleSwitch.vue"

  defineProps({
    title: { type: String, default: "" },
    modified: { type: Boolean, default: false }
  })

  const enabled = defineModel("enabled", { default: null })

  defineEmits(["reset"])
</script>

<template>
  <section class="group" :class="{ off: enabled === false }">
    <header v-if="title" class="row">
      <h2>{{ title }}</h2>
      <div class="spacer"></div>
      <Button ghost v-if="modified" @click="$emit('reset')">Reset</Button>
      <slot name="actions"></slot>
      <ToggleSwitch v-if="enabled !== null" tag="label" :label="title" v-model="enabled" />
    </header>
    <div class="flow" v-if="enabled !== false">
      <slot></slot>
    </div>
  </section>
</template>

<style scoped>
  .group {
    padding: var(--group-padding, 20px);
    border-top: 1px solid var(--line);
  }

  header {
    height: var(--control-tiny);
    margin-bottom: 14px;
  }

  .off header {
    margin-bottom: 0;
  }

  h2 {
    font-size: var(--font-lg);
  }

  .off h2 {
    color: var(--muted);
  }
</style>
