<script setup>
  defineProps({
    title: { type: String, required: true },
    text: { type: String, default: "" }
  })
</script>

<template>
  <div class="intro">
    <h1>{{ title }}</h1>
    <p v-if="text">{{ text }}</p>
    <slot></slot>
  </div>
</template>

<style scoped>
  .intro {
    margin-bottom: 22px;
  }

  h1 {
    margin: 0 0 6px;
    font-size: 28px;
    overflow-wrap: anywhere;
  }

  h1:last-child {
    margin-bottom: 0;
  }

  .intro p {
    margin: 0;
    color: var(--muted);
  }
</style>
