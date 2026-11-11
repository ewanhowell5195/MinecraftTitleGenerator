<script setup>
  import { nextTick, ref, watch } from "vue"
  import { useWindowEvents } from "../lib/events.js"
  import { usePopover } from "../lib/popover.js"
  import Icon from "./Icon.vue"

  const props = defineProps({
    items: { type: Array, default: () => [] },
    at: { type: Object, default: null }
  })

  const emit = defineEmits(["close"])

  const menu = ref(null)
  const position = ref({})
  let origin = null

  async function place() {
    position.value = { left: `${props.at.x}px`, top: `${props.at.y}px` }
    await nextTick()
    const rect = menu.value.getBoundingClientRect()
    const left = Math.max(4, Math.min(props.at.x, window.innerWidth - rect.width - 4))
    const top = Math.max(4, Math.min(props.at.y, window.innerHeight - rect.height - 4))
    position.value = { left: `${left}px`, top: `${top}px` }
    menu.value.querySelector("button:not(:disabled)")?.focus()
  }

  function choose(item) {
    if (!item.keepOpen) emit("close")
    item.action()
  }

  function close() {
    emit("close")
  }

  function key(event) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return
    event.preventDefault()
    const buttons = Array.from(menu.value.querySelectorAll("button:not(:disabled)"))
    const index = buttons.indexOf(document.activeElement)
    buttons[(index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length]?.focus()
  }

  const { outside } = usePopover(() => !!props.at, { popover: () => menu.value, focus: () => origin, close })

  useWindowEvents(() => !!props.at, { blur: close }, { keydown: key, wheel: outside })

  watch(() => props.at, (at, before) => {
    if (at && !before) origin = document.activeElement
    if (at) place()
  }, { immediate: true })
</script>

<template>
  <Teleport to="body">
    <div v-if="at" ref="menu" class="context-menu popover" role="menu" :style="position" @contextmenu.prevent>
      <template v-for="(item, index) of items" :key="index">
        <div v-if="item.divider" class="divider"></div>
        <p v-else-if="item.heading" class="heading">{{ item.label }}</p>
        <button v-else type="button" role="menuitem" :class="{ danger: item.danger }" :disabled="item.disabled" @click="choose(item)">
          <Icon :name="item.icon" :size="16" />
          <span>{{ item.label }}</span>
        </button>
      </template>
    </div>
  </Teleport>
</template>

<style scoped>
  .context-menu {
    display: flex;
    flex-direction: column;
    width: max-content;
    min-width: 170px;
    padding: 4px;
  }

  button {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 10px;
    min-height: var(--control);
    padding: 0 10px;
    font: inherit;
    font-size: var(--font-base);
    font-weight: 500;
    color: var(--text);
    background: transparent;
  }

  .heading {
    max-width: 240px;
    margin: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    padding: 7px 10px;
    font-size: var(--font-sm);
    color: var(--muted);
  }

  button:hover:not(:disabled),
  button:focus-visible {
    outline: none;
    background: var(--card-hover);
  }

  button:disabled:hover {
    background: transparent;
  }

  button svg {
    color: var(--muted);
  }

  button.danger {
    color: var(--danger);
    background: transparent;
  }

  button.danger svg {
    color: var(--danger);
  }

  .divider {
    height: 1px;
    margin: 4px 2px;
    background: var(--line);
  }
</style>
