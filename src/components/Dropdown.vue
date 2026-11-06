<script setup>
  import { computed, nextTick, ref } from "vue"
  import { useWindowEvents } from "../lib/events.js"
  import Icon from "./Icon.vue"

  const props = defineProps({
    options: { type: Array, required: true },
    label: { type: String, default: "" }
  })

  const value = defineModel({ default: null })

  const open = ref(false)
  const active = ref(0)
  const trigger = ref(null)
  const menu = ref(null)
  const position = ref({})

  const selectedIndex = computed(() => Math.max(0, props.options.findIndex(option => option.value === value.value)))
  const selected = computed(() => props.options[selectedIndex.value])

  function place() {
    const rect = trigger.value.getBoundingClientRect()
    const room = window.innerHeight - rect.bottom - 8
    const above = room < 200 && rect.top > room
    const limit = Math.max(120, (above ? rect.top : room) - 8)
    position.value = { left: `${rect.left}px`, width: `${rect.width}px`, maxHeight: `${limit}px`, ...(above ? { bottom: `${window.innerHeight - rect.top + 4}px` } : { top: `${rect.bottom + 4}px` }) }
  }

  async function show() {
    open.value = true
    active.value = selectedIndex.value
    await nextTick()
    place()
    menu.value.children[active.value].scrollIntoView({ block: "nearest" })
  }

  function choose(option) {
    value.value = option.value
    open.value = false
    trigger.value.focus()
  }

  function move(by) {
    active.value = (active.value + by + props.options.length) % props.options.length
    menu.value.children[active.value].scrollIntoView({ block: "nearest" })
  }

  function key(event) {
    if (!open.value) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
        event.preventDefault()
        show()
      }
      return
    }
    if (event.key === "ArrowDown") move(1)
    else if (event.key === "ArrowUp") move(-1)
    else if (event.key === "Enter" || event.key === " ") choose(props.options[active.value])
    else if (event.key === "Escape" || event.key === "Tab") open.value = false
    else return
    if (event.key !== "Tab") event.preventDefault()
  }

  function outside(event) {
    if (!menu.value.contains(event.target) && !trigger.value.contains(event.target)) close()
  }

  function close() {
    open.value = false
  }

  function scrolled(event) {
    if (!menu.value.contains(event.target)) close()
  }

  useWindowEvents(open, { resize: close }, { pointerdown: outside, scroll: scrolled })
</script>

<template>
  <div class="dropdown field">
    <span v-if="label" class="label">{{ label }}</span>
    <button ref="trigger" type="button" class="trigger field-button" :class="{ open }" :aria-expanded="open" @click="open ? close() : show()" @keydown="key">
      <img v-if="selected.image" class="image" :src="selected.image" alt="">
      <span class="text">
        <span class="name">{{ selected.label }}</span>
        <span v-if="selected.hint" class="hint">{{ selected.hint }}</span>
      </span>
      <Icon class="chevron" name="down" :size="14" />
    </button>
    <Teleport to="body">
      <ul v-if="open" ref="menu" class="dropdown-menu popover" role="listbox" :style="position">
        <li v-for="(option, index) of options" :key="String(option.value)" role="option" :aria-selected="option.value === value" :class="{ selected: option.value === value, active: index === active }" @pointermove="active = index" @click="choose(option)">
          <img v-if="option.image" class="image" :src="option.image" alt="">
          <span class="text">
            <span class="name">{{ option.label }}</span>
            <span v-if="option.hint" class="hint">{{ option.hint }}</span>
          </span>
        </li>
      </ul>
    </Teleport>
  </div>
</template>

<style scoped>
  .dropdown {
    min-width: 0;
  }

  .trigger {
    min-height: 40px;
    padding: 6px 10px;
    font-weight: 500;
    text-align: left;
  }

  .trigger.open {
    border-color: var(--accent);
  }

  .chevron {
    margin-left: auto;
    color: var(--faint);
    transition: transform var(--duration);
  }

  .open .chevron {
    transform: rotate(180deg);
  }

  .dropdown-menu {
    margin: 0;
    padding: 4px;
    overflow-y: auto;
    list-style: none;
  }

  li {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 36px;
    padding: 5px 8px;
    font-size: var(--font-base);
    cursor: pointer;
  }

  li.active {
    background: var(--card-hover);
  }

  li.selected {
    box-shadow: inset 2px 0 0 var(--accent);
  }

  .text {
    display: flex;
    align-items: baseline;
    gap: 8px;
    min-width: 0;
  }

  .name {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  li.selected .name {
    color: var(--accent);
  }

  .hint {
    flex: none;
  }

  .image {
    flex: none;
    width: 26px;
    height: 26px;
    object-fit: contain;
  }
</style>
