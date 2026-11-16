<script setup>
  import { computed, ref } from "vue"
  import Button from "../components/Button.vue"
  import Checkbox from "../components/Checkbox.vue"
  import Dialog from "../components/Dialog.vue"
  import { hasCase } from "../lib/font/editor/characters.js"
  import { casedCharacters, characterGroups, codeOf, drawnCharacters, matchesSearch } from "../lib/font/editor/coverage.js"

  const props = defineProps({
    title: { type: String, required: true },
    source: { type: Object, required: true },
    family: { type: String, required: true },
    letterCase: { type: String, required: true },
    selected: { type: Array, default: () => [] },
    locked: { type: Array, default: () => [] },
    required: { type: Array, default: null },
    requiring: { type: Boolean, default: false },
    action: { type: String, required: true }
  })

  const emit = defineEmits(["pick", "close"])

  function keyOf(char) {
    if (!hasCase(char)) return char
    return props.letterCase === "upper" ? char.toUpperCase() : char.toLowerCase()
  }

  const chosen = ref(new Set(props.selected.map(keyOf)))
  const requireAll = ref(props.requiring)
  const search = ref("")
  const hovered = ref(null)

  const kept = computed(() => new Set(props.locked))
  const requiredKeys = computed(() => new Set((props.required ?? []).map(keyOf)))
  const picked = computed(() => requireAll.value ? new Set(Array.from(chosen.value).concat(Array.from(requiredKeys.value))) : chosen.value)
  const all = computed(() => casedCharacters(drawnCharacters(props.source), props.letterCase))
  const groups = computed(() => characterGroups(all.value.filter(char => matchesSearch(char, search.value))))
  const fontFamily = computed(() => `"${props.family}", var(--font-ui)`)
  const status = computed(() => {
    if (hovered.value) return `${hovered.value} ${codeOf(hovered.value)}${kept.value.has(hovered.value) ? ", already in your font" : forced(hovered.value) ? ", required" : ""}`
    return picked.value.size === 1 ? "1 character chosen" : `${picked.value.size} characters chosen`
  })

  function on(char) {
    return picked.value.has(keyOf(char))
  }

  function forced(char) {
    return requireAll.value && requiredKeys.value.has(keyOf(char))
  }

  function toggle(char) {
    const next = new Set(chosen.value)
    if (next.has(keyOf(char))) next.delete(keyOf(char))
    else next.add(keyOf(char))
    chosen.value = next
  }

  function hover(event) {
    hovered.value = event.target.closest?.("[data-char]")?.dataset.char ?? null
  }
</script>

<template>
  <Dialog large :title="title" close-title="Cancel" dismissable @close="emit('close')">
    <div class="browser">
      <div class="tools">
        <input v-model="search" type="text" placeholder="Search, eg é or U+00E9" aria-label="Search characters">
        <span class="hint">{{ all.length }} characters in this font{{ kept.size ? `, ${kept.size} already in yours` : "" }}</span>
        <Checkbox v-if="required" v-model="requireAll" label="Required characters" />
      </div>
      <div class="scroll" @pointerover="hover" @pointerleave="hovered = null">
        <section v-for="group of groups" :key="group.id" class="group">
          <header>
            <h3>{{ group.label }}</h3>
            <span class="hint">{{ group.chars.length }}</span>
          </header>
          <div class="grid" :style="{ fontFamily }">
            <button v-for="char of group.chars" :key="char" type="button" class="char" :class="{ on: on(char), kept: kept.has(char), forced: forced(char) }" :data-char="char" :disabled="kept.has(char) || forced(char)" :aria-pressed="on(char) || kept.has(char)" :aria-label="`${char} ${codeOf(char)}`" @click="toggle(char)">{{ char }}</button>
          </div>
        </section>
        <p v-if="!groups.length" class="empty-state">No characters match.</p>
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

  .char {
    height: 44px;
    padding: 0;
    font: inherit;
    font-size: 24px;
    line-height: 1;
    color: var(--text);
    background: var(--card);
    border: 1px solid var(--line);
    user-select: none;
  }

  .char:hover {
    background: var(--card-hover);
  }

  .char.on {
    background: var(--accent-soft);
    border-color: var(--accent);
  }

  .char.forced {
    color: var(--muted);
    cursor: default;
    opacity: 0.55;
  }

  .char.kept {
    color: var(--muted);
    background: transparent;
    border-style: dashed;
    cursor: default;
    opacity: 1;
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
