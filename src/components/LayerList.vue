<script setup>
  import { computed, onBeforeUnmount, ref, watch } from "vue"
  import { clamp } from "../lib/maths.js"
  import { savedPreset } from "../lib/presets.js"
  import { dropPreview, previews, renderPreview } from "../lib/previews.js"
  import { useReorderDrag } from "../lib/reorder.js"
  import { TYPES } from "../lib/settings.js"
  import { addObject, duplicateLine, lineHidden, lineText, removeLine, removeObject, runtime, scene, select, selectGroup, toggleLine } from "../lib/scene.js"
  import { view } from "../lib/view.js"
  import ContextMenu from "./ContextMenu.vue"
  import Icon from "./Icon.vue"
  import PresetsDialog from "./PresetsDialog.vue"
  import RenderDialog from "./RenderDialog.vue"

  const SETTLE = 150

  const choosingPreset = ref(false)

  const rendered = new Map()
  const queued = new Set()
  let timer = null

  function flush() {
    timer = null
    for (const id of queued) {
      const state = runtime[id]
      if (state?.preview && state.transform) renderPreview(id, { ...state.preview, transform: state.transform })
      else dropPreview(id)
    }
    queued.clear()
  }

  watch(() => scene.objects.map(object => [object.id, runtime[object.id]]), list => {
    const ids = new Set(list.map(([id]) => id))
    for (const [id, state] of list) {
      const key = state && [state.preview, state.transform]
      const last = rendered.get(id)
      if (key && last && key[0] === last[0] && key[1] === last[1]) continue
      rendered.set(id, key)
      if (!key) continue
      queued.add(id)
    }
    for (const id of rendered.keys()) {
      if (ids.has(id)) continue
      rendered.delete(id)
      dropPreview(id)
    }
    if (!queued.size) return
    clearTimeout(timer)
    timer = setTimeout(flush, SETTLE)
  }, { immediate: true })

  const rows = computed(() => {
    const list = []
    for (const object of scene.objects) {
      const row = list[list.length - 1]
      if (object.group !== null && row?.group === object.group) row.words.push(object)
      else list.push({ key: object.group === null ? `object-${object.id}` : `group-${object.group}`, group: object.group, words: [object] })
    }
    return list
  })

  function selected(object) {
    if (view.render) return false
    return scene.selectedGroup === null ? scene.selected === object.id : object.group === scene.selectedGroup
  }

  function label(object) {
    return object.text.trim() || "(empty)"
  }

  function pick(object) {
    if (dropped) return
    select(object)
    view.render = false
  }

  function pickGroup(group) {
    if (dropped) return
    selectGroup(group)
    view.render = false
  }

  const list = ref(null)
  const { dragged, press } = useReorderDrag({ begin, point: along, reorder, follow, release })
  let dropped = false

  function along(event, drag) {
    return drag.vertical ? event.clientY : event.clientX
  }

  function edge(element, drag) {
    const rect = element.getBoundingClientRect()
    return drag.vertical ? rect.top : rect.left
  }

  function centre(element, drag) {
    const rect = element.getBoundingClientRect()
    return drag.vertical ? rect.top + rect.height / 2 : rect.left + rect.width / 2
  }

  function size(element, drag) {
    return drag.vertical ? element.offsetHeight : element.offsetWidth
  }

  function target(drag) {
    const element = drag.lifted
    const box = (drag.object ? element.parentElement : list.value).getBoundingClientRect()
    const [min, max] = drag.vertical ? [box.top, box.bottom - size(element, drag)] : [box.left, box.right - size(element, drag)]
    return clamp(drag.point - drag.grab, min, max)
  }

  function follow(drag) {
    const element = drag.lifted
    element.style.transform = ""
    const offset = target(drag) - edge(element, drag)
    element.style.transform = drag.vertical ? `translateY(${offset}px)` : `translateX(${offset}px)`
  }

  function slot(elements, from, drag) {
    const start = target(drag)
    const end = start + size(drag.lifted, drag)
    return elements.filter((element, index) => index !== from && centre(element, drag) < (index < from ? start : end)).length
  }

  function begin(event, row, object) {
    const element = event.currentTarget
    const lifted = object || row.group === null ? element : element.parentElement
    const drag = { id: object?.id ?? row.key, key: row.key, object, element, lifted, vertical: getComputedStyle(list.value).flexDirection === "column" }
    drag.grab = along(event, drag) - edge(lifted, drag)
    return drag
  }

  function moved(items, from, to) {
    const order = items.slice()
    order.splice(to, 0, order.splice(from, 1)[0])
    return order
  }

  function reorder(drag) {
    if (drag.object) {
      const row = rows.value.find(item => item.words.includes(drag.object))
      const from = row.words.indexOf(drag.object)
      const to = slot(Array.from(drag.element.parentElement.querySelectorAll(":scope > .layer")), from, drag)
      if (to === from) return
      const order = moved(row.words, from, to)
      scene.objects = rows.value.flatMap(item => item === row ? order : item.words)
      return
    }
    const from = rows.value.findIndex(item => item.key === drag.key)
    const elements = Array.from(list.value.querySelectorAll(":scope > [data-row]"), element => element.classList.contains("single") ? element.firstElementChild : element)
    const to = slot(elements, from, drag)
    if (to === from) return
    scene.objects = moved(rows.value, from, to).flatMap(item => item.words)
  }

  function release(drag, active) {
    if (active) {
      dropped = true
      setTimeout(() => (dropped = false))
    }
    drag.lifted.style.transform = ""
  }

  function add() {
    addObject()
    view.render = false
  }

  const context = ref(null)

  function shift(row, by) {
    const index = rows.value.indexOf(row)
    scene.objects = moved(rows.value, index, index + by).flatMap(item => item.words)
  }

  function menu(event, row, object) {
    if (object) pick(object)
    else if (row.group === null) pick(row.words[0])
    else pickGroup(row.group)
    const lead = row.words[0]
    const index = rows.value.indexOf(row)
    const noun = row.group === null ? "" : " line"
    const hidden = lineHidden(lead)
    const items = [
      { label: `${hidden ? "Show" : "Hide"}${noun}`, icon: hidden ? "eye" : "hidden", action: () => toggleLine(lead) },
      { label: `Duplicate${noun}`, icon: "copy", action: () => duplicateLine(lead) },
      { label: `Move${noun} up`, icon: "up", disabled: index === 0, action: () => shift(row, -1) },
      { label: `Move${noun} down`, icon: "down", disabled: index === rows.value.length - 1, action: () => shift(row, 1) },
      { divider: true }
    ]
    if (object) items.push({ label: "Delete word", icon: "close", danger: true, action: () => removeObject(object) })
    items.push({ label: `Delete${noun}`, icon: "trash", danger: true, action: () => removeLine(lead) })
    context.value = { at: { x: event.clientX, y: event.clientY }, items }
  }

  onBeforeUnmount(() => clearTimeout(timer))
</script>

<template>
  <nav class="layers">
    <div class="presets">
      <button class="rail-button" title="Open a saved preset" @click="choosingPreset = true">
        <Icon name="bookmark" :size="20" />
        <span>Presets</span>
      </button>
      <p v-if="savedPreset && !savedPreset.skipped" class="saved">Saved as {{ savedPreset.name }}</p>
    </div>
    <div class="divider"></div>
    <div ref="list" class="list" :class="{ dragging: dragged !== null }" @dragstart.prevent>
      <div v-for="row of rows" :key="row.key" :data-row="row.key" :class="row.group === null ? 'single' : { group: true, selected: !view.render && scene.selectedGroup === row.group, hidden: lineHidden(row.words[0]), dragged: dragged === row.key }">
        <div v-if="row.group !== null" class="head" tabindex="0" @pointerdown="press($event, row, null)" @click="pickGroup(row.group)" @contextmenu.prevent="menu($event, row, null)" @keydown.enter="pickGroup(row.group)" :title="`${lineText(row.words[0]) || '(empty)'} (${TYPES[row.words[0].type].name})`">
          <Icon name="layers" :size="14" />
        </div>
        <div class="layer" v-for="object of row.words" :key="object.id" tabindex="0" @pointerdown="press($event, row, row.group === null ? null : object)" @click="pick(object)" @contextmenu.prevent="menu($event, row, row.group === null ? null : object)" @keydown.enter="pick(object)" :class="{ selected: selected(object), hidden: object.hidden, error: runtime[object.id]?.error, dragged: dragged === object.id || dragged === row.key && row.group === null }" :title="`${label(object)} (${TYPES[object.type].name})`">
          <div class="thumb">
            <img v-if="previews[object.id]" :src="previews[object.id]" alt="">
          </div>
          <span class="name">{{ label(object) }}</span>
        </div>
      </div>
      <button class="add" @click="add" title="Add text">
        <Icon name="plus" :size="18" />
      </button>
    </div>
    <div class="divider"></div>
    <button class="render rail-button" :class="{ selected: view.render }" @click="view.render = true">
      <Icon name="camera" :size="20" />
      <span>Render</span>
    </button>
    <ContextMenu :items="context?.items" :at="context?.at" @close="context = null" />
    <PresetsDialog v-if="choosingPreset" @close="choosingPreset = false" />
    <RenderDialog v-if="savedPreset?.skipped" title="Preset saved" close-title="Close" dismissable @close="savedPreset = null">
      <div class="skipped">
        <p>{{ savedPreset.skipped === 1 ? "1 uploaded overlay" : `${savedPreset.skipped} uploaded overlays` }} could not be saved, so {{ savedPreset.name }} opens without {{ savedPreset.skipped === 1 ? "it" : "them" }}.</p>
        <button class="primary" @click="savedPreset = null">OK</button>
      </div>
    </RenderDialog>
  </nav>
</template>

<style scoped>
  .layers {
    grid-area: layers;
    display: flex;
    flex-direction: column;
    min-height: 0;
    padding: 10px 8px;
    background: var(--bg);
    border-right: 1px solid var(--line);
  }

  .list {
    flex: 0 1 auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    min-height: 0;
    overflow-y: auto;
    scrollbar-width: none;
  }

  .layer {
    flex: none;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    width: 60px;
    cursor: pointer;
  }

  .thumb {
    width: 56px;
    height: 56px;
    background: var(--card);
    border: 2px solid transparent;
    transition: border-color var(--duration), background var(--duration);
  }

  .layer:hover .thumb {
    background: var(--card-hover);
  }

  .layer.selected .thumb {
    background: var(--accent-soft);
    border-color: var(--accent);
  }

  .layer.error .thumb {
    border-color: var(--danger);
  }

  .layer:focus-visible {
    outline: none;
  }

  .layer:focus-visible .thumb {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .thumb img {
    display: block;
    width: 100%;
    height: 100%;
    padding: 4px;
    object-fit: contain;
  }

  .layer.hidden img {
    opacity: 0.3;
  }

  .name {
    max-width: 60px;
    overflow: hidden;
    font-size: var(--font-xxs);
    font-weight: 600;
    white-space: nowrap;
    text-overflow: ellipsis;
    color: var(--faint);
  }

  .layer.selected .name {
    color: var(--text);
  }

  .single {
    display: contents;
  }

  .dragged {
    position: relative;
    z-index: 1;
    background-color: var(--bg);
    box-shadow: var(--drag-shadow);
  }

  .group.selected.dragged {
    background: linear-gradient(var(--accent-soft), var(--accent-soft)), var(--bg);
  }

  .dragging,
  .dragging .layer,
  .dragging .head {
    cursor: grabbing;
  }

  .group {
    flex: none;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    width: 60px;
    padding-bottom: 4px;
    border: 2px solid var(--line-strong);
    transition: border-color var(--duration), background var(--duration);
  }

  .group.selected {
    border-color: var(--accent);
    background: var(--accent-soft);
  }

  .group .layer {
    width: 52px;
  }

  .group .thumb {
    width: 48px;
    height: 48px;
  }

  .group .name {
    max-width: 52px;
  }

  .head {
    display: flex;
    align-items: center;
    justify-content: center;
    align-self: stretch;
    height: 22px;
    color: var(--faint);
    background: var(--card);
    cursor: pointer;
  }

  .head:hover {
    color: var(--text);
    background: var(--card-hover);
  }

  .group.selected .head {
    color: var(--accent);
    background: transparent;
  }

  .head:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }

  .group.hidden .head {
    opacity: 0.5;
  }

  .add {
    flex: none;
    width: 56px;
    height: 56px;
    padding: 0;
    color: var(--faint);
    background: transparent;
    border: 2px dashed var(--line-strong);
  }

  .add:hover {
    color: var(--text);
    border-color: var(--accent);
    background: transparent;
  }

  .divider {
    flex: none;
    height: 1px;
    margin: 10px 4px;
    background: var(--line);
  }

  .rail-button {
    flex-direction: column;
    gap: 5px;
    padding: 10px 2px 8px;
    font-size: var(--font-xs);
    color: var(--faint);
    background: transparent;
  }

  .rail-button:hover {
    color: var(--text);
    background: var(--card);
  }

  .rail-button.selected {
    color: var(--accent);
    background: var(--accent-soft);
  }

  .render {
    flex: none;
  }

  .presets {
    position: relative;
    flex: none;
    display: flex;
    flex-direction: column;
  }

  .saved {
    position: absolute;
    top: 50%;
    left: calc(100% + 12px);
    z-index: 5;
    width: max-content;
    max-width: min(320px, 70vw);
    margin: 0;
    padding: 6px 10px;
    font-size: var(--font-md);
    background: var(--card);
    border: 1px solid var(--line);
    transform: translateY(-50%);
    pointer-events: none;
  }

  .skipped {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 16px;
    padding: 20px;
  }

  .skipped p {
    align-self: stretch;
    margin: 0;
    font-size: var(--font-base);
  }

  @media (max-width: 800px) {
    .saved {
      top: auto;
      bottom: calc(100% + 8px);
      left: 0;
      transform: none;
    }

    .layers {
      flex-direction: row;
      align-items: center;
      padding: 6px 8px;
      border-right: none;
      border-top: 1px solid var(--line);
    }

    .list {
      flex-direction: row;
      overflow-x: auto;
      overflow-y: hidden;
    }

    .layer {
      width: 52px;
    }

    .thumb,
    .add {
      width: 48px;
      height: 48px;
    }

    .name {
      max-width: 52px;
    }

    .group {
      flex-direction: row;
      width: auto;
      padding: 0 4px 0 0;
    }

    .group .layer {
      width: 44px;
    }

    .group .thumb {
      width: 40px;
      height: 40px;
    }

    .group .name {
      max-width: 44px;
    }

    .head {
      flex-direction: column;
      width: 22px;
      height: auto;
    }

    .divider {
      width: 1px;
      height: 44px;
      margin: 0 8px;
    }

    .render {
      padding: 6px 8px;
    }
  }
</style>
