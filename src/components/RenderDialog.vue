<script setup>
  import { useWindowEvents } from "../lib/events.js"
  import Button from "./Button.vue"
  import Icon from "./Icon.vue"

  defineProps({
    title: { type: String, required: true },
    closeTitle: { type: String, required: true },
    large: { type: Boolean, default: false },
    wide: { type: Boolean, default: false },
    dismissable: { type: Boolean, default: false }
  })

  const emit = defineEmits(["close"])

  function key(event) {
    if (event.key === "Escape") emit("close")
  }

  useWindowEvents(() => true, { keydown: key })
</script>

<template>
  <Teleport to="body">
    <div class="backdrop" :class="{ large, wide }" @pointerdown.self="dismissable && emit('close')">
      <div class="dialog" role="dialog" :aria-label="title">
        <header class="row">
          <h2>{{ title }}</h2>
          <div class="spacer"></div>
          <Button ghost @click="emit('close')" :aria-label="closeTitle"><template #icon><Icon name="close" :size="16" /></template></Button>
        </header>
        <slot></slot>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 50;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    background: #000b;
  }

  .dialog {
    width: min(420px, 100%);
    background: var(--surface);
    border: 1px solid var(--line-strong);
    box-shadow: var(--shadow);
  }

  .wide .dialog {
    width: min(560px, 100%);
  }

  .large .dialog {
    display: flex;
    flex-direction: column;
    width: min(1000px, 100%);
    height: min(760px, 100%);
  }

  header {
    padding: 10px 10px 10px 20px;
    border-bottom: 1px solid var(--line);
  }

  @media (max-width: 800px) {
    .large {
      padding: 16px;
    }

    .large .dialog {
      height: 100%;
    }
  }
</style>
