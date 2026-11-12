<script setup>
  import { computed, nextTick, ref } from "vue"
  import people from "virtual:people"
  import { AUTHOR_LIMITS, authorList } from "../lib/authors.js"
  import { usePopover } from "../lib/popover.js"
  import Icon from "./Icon.vue"

  const SHOWN = 8

  defineProps({
    placeholder: { type: String, default: "Add a name" }
  })

  const names = defineModel({ type: Array, default: () => [] })

  const box = ref(null)
  const field = ref(null)
  const menu = ref(null)
  const text = ref("")
  const open = ref(false)
  const active = ref(0)
  const position = ref({})

  const typed = computed(() => text.value.trim().replace(/\s+/g, " "))
  const full = computed(() => names.value.length >= AUTHOR_LIMITS.names)
  const options = computed(() => {
    const taken = names.value.map(name => name.toLowerCase())
    const term = typed.value.toLowerCase()
    const known = people.filter(person => !taken.includes(person.toLowerCase()) && person.toLowerCase().includes(term))
    const fresh = term && !taken.includes(term) && !people.some(person => person.toLowerCase() === term)
    return known.slice(0, SHOWN).map(name => ({ name })).concat(fresh ? [{ name: typed.value, fresh: true }] : [])
  })

  function place() {
    const rect = box.value.getBoundingClientRect()
    position.value = { left: `${rect.left}px`, top: `${rect.bottom + 4}px`, width: `${rect.width}px` }
  }

  async function show() {
    if (full.value) return
    open.value = true
    active.value = 0
    await nextTick()
    place()
  }

  function close() {
    open.value = false
  }

  function add(name) {
    names.value = authorList(names.value.concat(name))
    text.value = ""
    active.value = 0
    if (full.value) close()
    else nextTick(place)
  }

  function remove(name) {
    names.value = names.value.filter(item => item !== name)
    nextTick(() => open.value && place())
  }

  function move(by) {
    if (options.value.length) active.value = (active.value + by + options.value.length) % options.value.length
  }

  function key(event) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault()
      if (open.value) move(event.key === "ArrowDown" ? 1 : -1)
      else show()
    } else if (event.key === "Enter" || event.key === ",") {
      if (event.key === "," && !typed.value) return
      event.preventDefault()
      const picked = event.key === "Enter" && open.value ? options.value[active.value]?.name : typed.value
      if (picked) add(picked)
    } else if (event.key === "Backspace" && !text.value && names.value.length) remove(names.value.at(-1))
  }

  function input() {
    active.value = 0
    show()
  }

  function leave() {
    if (typed.value) add(typed.value)
    close()
  }

  usePopover(open, { popover: () => menu.value, trigger: () => box.value, focus: () => field.value, close })
</script>

<template>
  <div ref="box" class="name-list" :class="{ open }" @click="field?.focus()">
    <span v-for="name of names" :key="name" class="name">
      <span class="ellipsis">{{ name }}</span>
      <button type="button" class="remove" :aria-label="`Remove ${name}`" @click.stop="remove(name)"><Icon name="close" :size="12" /></button>
    </span>
    <input v-if="!full" ref="field" type="text" v-model="text" :maxlength="AUTHOR_LIMITS.name" :placeholder="names.length ? '' : placeholder" spellcheck="false" autocomplete="off" aria-label="Add a name" @focus="show" @blur="leave" @input="input" @keydown="key">
    <Teleport to="body">
      <ul v-if="open && options.length" ref="menu" class="name-menu popover" role="listbox" :style="position" @mousedown.prevent>
        <li v-for="(option, index) of options" :key="option.name" role="option" :aria-selected="index === active" :class="{ active: index === active }" @pointermove="active = index" @click="add(option.name)">
          <Icon v-if="option.fresh" name="plus" :size="14" />
          <span class="ellipsis">{{ option.fresh ? `Add ${option.name}` : option.name }}</span>
        </li>
      </ul>
    </Teleport>
  </div>
</template>

<style scoped>
  .name-list {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px;
    min-height: var(--control);
    padding: 3px;
    background: var(--card);
    border: 1px solid transparent;
    cursor: text;
    transition: border-color var(--duration), background var(--duration);
  }

  .name-list:hover {
    background: var(--card-hover);
  }

  .name-list:focus-within,
  .name-list.open {
    border-color: var(--accent);
    background: var(--field);
  }

  .name {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    max-width: 100%;
    min-height: calc(var(--control) - 8px);
    padding: 0 4px 0 8px;
    font-size: var(--font-md);
    font-weight: 500;
    background: var(--line);
    cursor: default;
    user-select: none;
  }

  .remove {
    flex: none;
    padding: 3px;
    color: var(--faint);
    background: none;
    border: 0;
  }

  .remove:hover {
    color: var(--text);
    background: none;
  }

  .name-list input {
    flex: 1;
    width: auto;
    min-width: 90px;
    min-height: calc(var(--control) - 8px);
    padding: 0 8px;
    background: none;
    border: 0;
  }

  .name-list input:hover:not(:disabled),
  .name-list input:focus {
    background: none;
  }

  .name-menu {
    margin: 0;
    padding: 4px;
    overflow-y: auto;
    list-style: none;
  }

  .name-menu li {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: var(--control);
    padding: 0 8px;
    font-size: var(--font-base);
    cursor: pointer;
    user-select: none;
  }

  .name-menu li.active {
    background: var(--card-hover);
  }
</style>
