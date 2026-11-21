<script setup>
  import { computed, onBeforeUnmount, reactive, ref, shallowRef, watch } from "vue"
  import Button from "../components/Button.vue"
  import Checkbox from "../components/Checkbox.vue"
  import Dialog from "../components/Dialog.vue"
  import { hasCase } from "../lib/font/editor/characters.js"
  import { casedCharacters, characterGroups, codeOf, drawnCharacters, matchesSearch } from "../lib/font/editor/coverage.js"
  import CharacterChunk from "./CharacterChunk.vue"

  const CHUNK = 128
  const FIRST_CHUNKS = 4
  const MORE_CHUNKS = 1

  const props = defineProps({
    title: { type: String, required: true },
    source: { type: Object, required: true },
    family: { type: String, default: null },
    letterCase: { type: String, required: true },
    selected: { type: Array, default: () => [] },
    locked: { type: Function, default: () => false },
    required: { type: Array, default: null },
    requiring: { type: Boolean, default: false },
    action: { type: String, required: true }
  })

  const emit = defineEmits(["pick", "close"])

  function keyOf(char) {
    if (!hasCase(char)) return char
    return props.letterCase === "upper" ? char.toUpperCase() : char.toLowerCase()
  }

  const chosen = reactive(new Set(props.selected.map(keyOf)))
  const requireAll = ref(props.requiring)
  const search = ref("")
  const hovered = ref(null)
  const drawn = shallowRef(null)
  const shown = ref(FIRST_CHUNKS)
  const picture = shallowRef(null)
  let timer = 0

  drawnCharacters(props.source).then(chars => drawn.value = chars)
  if (props.source.minecraft) {
    import("../lib/font/minecraftFiles.js").then(({ glyphPicture }) => {
      const colour = getComputedStyle(document.documentElement).getPropertyValue("--text").trim()
      picture.value = char => glyphPicture(props.source, char, colour)
    })
  }

  const all = computed(() => drawn.value ? casedCharacters(drawn.value, props.letterCase) : [])
  const kept = computed(() => new Set(all.value.filter(char => props.locked(char))))
  const requiredKeys = computed(() => new Set((props.required ?? []).map(keyOf)))
  const picked = computed(() => requireAll.value ? new Set(Array.from(chosen).concat(Array.from(requiredKeys.value))) : new Set(chosen))
  const groups = computed(() => {
    let order = 0
    return characterGroups(all.value.filter(char => matchesSearch(char, search.value))).map(group => {
      const chunks = []
      for (let start = 0; start < group.chars.length; start += CHUNK) chunks.push({ order: order++, chars: group.chars.slice(start, start + CHUNK) })
      return { ...group, chunks }
    })
  })
  const chunkCount = computed(() => groups.value.reduce((count, group) => count + group.chunks.length, 0))
  const visibleGroups = computed(() => groups.value.filter(group => group.chunks[0].order < shown.value).map(group => ({ ...group, chunks: group.chunks.filter(chunk => chunk.order < shown.value) })))
  const fontFamily = computed(() => props.family ? `"${props.family}", var(--font-ui)` : "var(--font-ui)")
  const status = computed(() => {
    if (hovered.value) return `${hovered.value} ${codeOf(hovered.value)}${kept.value.has(hovered.value) ? ", already in your font" : forced(hovered.value) ? ", required" : ""}`
    return picked.value.size === 1 ? "1 character chosen" : `${picked.value.size} characters chosen`
  })

  function forced(char) {
    return requiredKeys.value.has(keyOf(char)) && requireAll.value
  }

  function tile(char) {
    const isKept = kept.value.has(char)
    const isForced = forced(char)
    const on = isForced || chosen.has(keyOf(char))
    return { class: { on, kept: isKept, forced: isForced }, disabled: isKept || isForced, "aria-pressed": on || isKept }
  }

  function toggle(event) {
    const button = event.target.closest?.("[data-char]")
    if (!button || button.disabled) return
    const key = keyOf(button.dataset.char)
    if (chosen.has(key)) chosen.delete(key)
    else chosen.add(key)
  }

  function hover(event) {
    hovered.value = event.target.closest?.("[data-char]")?.dataset.char ?? null
  }

  function showMore() {
    timer = 0
    if (shown.value >= chunkCount.value) return
    shown.value += MORE_CHUNKS
    timer = setTimeout(showMore)
  }

  watch(groups, () => {
    clearTimeout(timer)
    shown.value = FIRST_CHUNKS
    timer = setTimeout(showMore)
  })

  onBeforeUnmount(() => clearTimeout(timer))
</script>

<template>
  <Dialog large :title="title" close-title="Cancel" dismissable @close="emit('close')">
    <div class="browser">
      <div class="tools">
        <input v-model="search" type="text" placeholder="Search, eg é or U+00E9" aria-label="Search characters">
        <span v-if="drawn" class="hint">{{ all.length }} characters in this font{{ kept.size ? `, ${kept.size} already in yours` : "" }}</span>
        <Checkbox v-if="required" v-model="requireAll" label="Required characters" />
      </div>
      <div class="scroll" @pointerover="hover" @pointerleave="hovered = null" @click="toggle">
        <section v-for="group of visibleGroups" :key="group.id" class="group">
          <header>
            <h3>{{ group.label }}</h3>
            <span class="hint">{{ group.chars.length }}</span>
          </header>
          <div class="grid" :style="{ fontFamily }">
            <CharacterChunk v-for="chunk of group.chunks" :key="chunk.chars[0]" :chars="chunk.chars" :tile="tile" :picture="picture" />
          </div>
        </section>
        <p v-if="!drawn" class="empty-state">Reading the font...</p>
        <p v-else-if="!groups.length" class="empty-state">No characters match.</p>
      </div>
      <footer class="dialog-actions">
        <span class="status hint">{{ status }}</span>
        <Button @click="emit('close')">Cancel</Button>
        <Button primary :disabled="!picked.size" @click="emit('pick', Array.from(picked), requireAll)">{{ action }}</Button>
      </footer>
    </div>
  </Dialog>
</template>

<style scoped>
  .browser {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  .tools {
    flex: none;
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 14px 20px;
    border-bottom: 1px solid var(--line);
  }

  .tools input {
    flex: 1;
    min-width: 0;
  }

  .scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 6px 20px 20px;
  }

  .group {
    content-visibility: auto;
    contain-intrinsic-size: auto 200px;
  }

  .group header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 14px 0 8px;
  }

  h3 {
    margin: 0;
    font-size: var(--font-base);
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(44px, 1fr));
    gap: 4px;
  }

  footer {
    flex: none;
    padding: 12px 20px;
    border-top: 1px solid var(--line);
  }

  .status {
    margin-right: auto;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  @media (max-width: 600px) {
    .tools .hint {
      display: none;
    }

    .status {
      flex-basis: 100%;
    }
  }
</style>
