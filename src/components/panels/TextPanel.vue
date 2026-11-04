<script setup>
  import { computed, nextTick, ref } from "vue"
  import { clamp } from "../../lib/maths.js"
  import { usePanel } from "../../lib/panel.js"
  import { useReorderDrag } from "../../lib/reorder.js"
  import { addWord, insertWord, removeObject, scene, select, selection, words } from "../../lib/scene.js"
  import Icon from "../Icon.vue"
  import Panel from "../Panel.vue"

  const line = computed(() => words(selection.value[0]))
  const placeholder = computed(() => line.value.length > 1 ? "word" : "Type your title")
  const { modified, reset } = usePanel("text")
  const fields = {}
  let picked = null

  function chosen(word) {
    return line.value.length > 1 && scene.selectedGroup === null && scene.selected === word.id
  }

  function focus(word) {
    if (line.value.length > 1 && scene.selectedGroup === null && scene.selected !== word.id) select(word)
  }

  function capture() {
    const word = line.value.find(word => fields[word.id] === document.activeElement)
    picked = word ? { word, start: fields[word.id].selectionStart, end: fields[word.id].selectionEnd } : null
  }

  function split({ word, start, end }) {
    const text = word.text
    const parts = [[0, start], [start, end], [end, text.length]].filter(([from, to]) => text.slice(from, to).trim())
    if (parts.length < 2 || !parts.some(([from, to]) => from === start && to === end)) return false
    let last = word
    let chosen = word
    for (const [index, [from, to]] of parts.entries()) {
      const value = text.slice(from, to).trim()
      if (index) last = insertWord(last, { text: value, spaceBefore: /\s/.test(text[from - 1] + text[from]) })
      else word.text = value
      if (from === start) chosen = last
    }
    select(chosen)
    return true
  }

  async function add() {
    const selected = picked
    picked = null
    if (selected && split(selected)) return
    addWord(line.value[line.value.length - 1])
    await nextTick()
    fields[scene.selected].select()
  }

  async function remove(word) {
    const index = line.value.indexOf(word)
    const before = line.value[index - 1] ?? line.value[index + 1]
    removeObject(word)
    await nextTick()
    const field = fields[before.id]
    field.focus()
    field.setSelectionRange(field.value.length, field.value.length)
  }

  function backspace(event, word) {
    if (word.text || line.value.length < 2) return
    event.preventDefault()
    remove(word)
  }

  const box = ref(null)
  const chips = {}
  const { dragged, press } = useReorderDrag({ prevent: true, begin, point: event => [event.clientX, event.clientY], reorder, follow, release })

  function begin(event, word) {
    const element = chips[word.id]
    const rect = element.getBoundingClientRect()
    return { id: word.id, word, element, grab: [event.clientX - rect.left, event.clientY - rect.top] }
  }

  function before(rect, [x, y]) {
    return y > rect.bottom || y >= rect.top && rect.left + rect.width / 2 < x
  }

  function reorder(drag) {
    const list = line.value
    const others = list.filter(word => word !== drag.word)
    const to = others.filter(word => before(chips[word.id].getBoundingClientRect(), drag.point)).length
    if (to === list.indexOf(drag.word)) return
    const order = others.slice(0, to).concat(drag.word, others.slice(to))
    const start = scene.objects.indexOf(list[0])
    scene.objects = scene.objects.slice(0, start).concat(order, scene.objects.slice(start + list.length))
  }

  function follow(drag) {
    const element = drag.element
    element.style.transform = ""
    const rect = element.getBoundingClientRect()
    const area = box.value.getBoundingClientRect()
    const x = clamp(drag.point[0] - drag.grab[0], area.left, area.right - rect.width)
    const y = clamp(drag.point[1] - drag.grab[1], area.top, area.bottom - rect.height)
    element.style.transform = `translate(${x - rect.left}px, ${y - rect.top}px)`
  }

  function release(drag, active) {
    if (!active) fields[drag.word.id].focus()
    drag.element.style.transform = ""
  }
</script>

<template>
  <Panel title="Words" :modified="modified" @reset="reset">
    <div ref="box" class="line" :class="{ single: line.length < 2, dragging: dragged !== null }">
      <template v-for="(word, index) of line" :key="word.id">
        <button v-if="index" class="join" :class="{ joined: !word.spaceBefore }" @click="word.spaceBefore = !word.spaceBefore" :aria-pressed="!word.spaceBefore" :title="word.spaceBefore ? 'Join words' : 'Add space'">
          <Icon :name="word.spaceBefore ? 'space' : 'link'" :size="14" />
        </button>
        <label :ref="el => (chips[word.id] = el)" class="chip" :class="{ chosen: chosen(word), dragged: dragged === word.id }" :data-value="word.text || placeholder">
          <span v-if="line.length > 1" class="grip" @pointerdown="press($event, word)" title="Drag to reorder">
            <Icon name="grip" :size="14" />
          </span>
          <input :ref="el => (fields[word.id] = el)" type="text" size="1" v-model="word.text" spellcheck="false" autocomplete="off" :placeholder="placeholder" :aria-label="line.length > 1 ? `Word ${index + 1}` : 'Text'" @focus="focus(word)" @keydown.backspace="backspace($event, word)">
          <button v-if="line.length > 1" class="remove" tabindex="-1" @click.prevent="remove(word)" title="Remove this word">
            <Icon name="close" :size="12" />
          </button>
        </label>
      </template>
      <button class="icon-button small add" @mousedown="capture" @click="add" title="Add word">
        <Icon name="plus" :size="16" />
      </button>
    </div>
    <p class="hint">Each word gets its own texture. Highlight part of a word and press + to split it off.</p>
  </Panel>
</template>

<style scoped>
  .line {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 2px;
    padding: 6px;
    background: var(--card);
    border: 1px solid transparent;
    transition: border-color var(--duration), background var(--duration);
  }

  .line:focus-within {
    border-color: var(--accent);
    background: var(--field);
  }

  .chip {
    position: relative;
    display: inline-grid;
    min-width: 0;
  }

  .chip::after,
  .chip input {
    grid-area: 1 / 1;
    min-width: 0;
    padding: 6px 10px;
    font-size: var(--font-xl);
    font-weight: 600;
  }

  .chip::after {
    content: attr(data-value) " ";
    visibility: hidden;
    overflow: hidden;
    white-space: pre;
    border: 1px solid transparent;
  }

  .chip input {
    width: auto;
    background: transparent;
    border-color: var(--line-strong);
  }

  .chip input:hover {
    background: var(--card-hover);
  }

  .chip input:focus {
    background: var(--card);
  }

  .chip.chosen input {
    background: var(--accent-soft);
  }

  .line:not(.single) .chip::after,
  .line:not(.single) .chip input {
    padding-left: 24px;
  }

  .grip {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 1px;
    display: flex;
    align-items: center;
    padding: 0 4px;
    color: var(--faint);
    cursor: grab;
    touch-action: none;
  }

  .grip:hover {
    color: var(--text);
  }

  .chip.dragged {
    z-index: 1;
    background: var(--card-hover);
    box-shadow: var(--drag-shadow);
  }

  .dragging,
  .dragging .grip {
    cursor: grabbing;
  }

  .single .chip {
    flex: 1;
  }

  .single .chip input {
    border-color: transparent;
  }

  .single .chip input:hover,
  .single .chip input:focus {
    background: transparent;
  }

  .remove {
    position: absolute;
    top: -7px;
    right: -7px;
    width: 18px;
    height: 18px;
    padding: 0;
    color: var(--text);
    background: var(--line-strong);
    opacity: 0;
    pointer-events: none;
    transition: opacity var(--duration), background var(--duration);
  }

  .chip:hover .remove,
  .chip:focus-within .remove {
    opacity: 1;
    pointer-events: auto;
  }

  .remove:hover {
    background: var(--danger);
  }

  .join {
    flex: none;
    width: 22px;
    height: 30px;
    padding: 0;
    color: var(--faint);
    background: transparent;
  }

  .join:hover {
    color: var(--text);
    background: var(--card-hover);
  }

  .join.joined {
    color: var(--accent);
  }

  .add {
    margin-left: 4px;
  }
</style>
