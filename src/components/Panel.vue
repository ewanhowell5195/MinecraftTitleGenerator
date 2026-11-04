<script setup>
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
      <slot name="actions"></slot>
      <button v-if="modified" class="small ghost" @click="$emit('reset')" title="Reset to defaults">Reset</button>
      <label v-if="enabled !== null" class="switch" :title="enabled ? 'Turn off' : 'Turn on'">
        <input type="checkbox" v-model="enabled">
        <span></span>
      </label>
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
    min-height: 28px;
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
