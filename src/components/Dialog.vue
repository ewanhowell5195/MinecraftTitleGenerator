<script setup>
  import { onBeforeUnmount, ref } from "vue"
  import { useWindowEvents } from "../lib/events.js"
  import Button from "./Button.vue"

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

  const backdrop = ref(null)

  function paintAsShown(canvas, source) {
    const { clientWidth: width, clientHeight: height } = source
    canvas.width = Math.min(source.width, Math.ceil(width * devicePixelRatio))
    canvas.height = Math.min(source.height, Math.ceil(height * devicePixelRatio))
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    canvas.getContext("2d")?.drawImage(source, 0, 0, canvas.width, canvas.height)
  }

  function fadeOut(element) {
    const copy = element.cloneNode(true)
    const canvases = element.querySelectorAll("canvas")
    copy.querySelectorAll("canvas").forEach((canvas, index) => paintAsShown(canvas, canvases[index]))
    copy.classList.add("leaving")
    copy.removeAttribute("role")
    copy.querySelector("[role=dialog]")?.removeAttribute("role")
    document.body.append(copy)
    copy.querySelector(".dialog").addEventListener("animationend", () => copy.remove(), { once: true })
  }

  onBeforeUnmount(() => {
    if (backdrop.value && !matchMedia("(prefers-reduced-motion: reduce)").matches) fadeOut(backdrop.value)
  })
</script>

<template>
  <Teleport to="body">
    <div ref="backdrop" class="backdrop" :class="{ large, wide }" @pointerdown.self="dismissable && emit('close')">
      <div class="dialog" role="dialog" :aria-label="title">
        <header class="row">
          <h2>{{ title }}</h2>
          <div class="spacer"></div>
          <Button ghost icon="close" :aria-label="closeTitle" @click="emit('close')" />
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
    animation: backdrop-in var(--duration) ease-out;
  }

  .dialog {
    width: min(420px, 100%);
    background: var(--surface);
    border: 1px solid var(--line-strong);
    box-shadow: var(--shadow);
    animation: dialog-in var(--duration) ease-out;
  }

  .backdrop.leaving {
    pointer-events: none;
    animation: backdrop-in var(--duration) ease-in reverse forwards;
  }

  .leaving .dialog {
    animation: dialog-in var(--duration) ease-in reverse forwards;
  }

  @keyframes backdrop-in {
    from {
      opacity: 0;
    }
  }

  @keyframes dialog-in {
    from {
      opacity: 0;
      scale: 0.96;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .backdrop,
    .dialog {
      animation: none;
    }
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
