<script setup>
  import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue"
  import Button from "../components/Button.vue"
  import ContextMenu from "../components/ContextMenu.vue"
  import Icon from "../components/Icon.vue"
  import RenderDialog from "../components/RenderDialog.vue"
  import Tile from "../components/Tile.vue"
  import TileGrid from "../components/TileGrid.vue"
  import { vLongPress } from "../lib/events.js"
  import { CREEPER, SPACE_CHAR, addCharacters, characterName, glyphOf, isBlank, isOptional, removeCharacter, setGlyph } from "../lib/fontEditor.js"
  import GlyphThumb from "./GlyphThumb.vue"
  import { arrowsMove, characters, clipboard, copyGlyph, font, pasteGlyph, selected, typing, update } from "./store.js"

  const ARROWS = { ArrowLeft: -1, ArrowRight: 1 }

  const context = ref(null)
  const list = ref(null)
  const section = ref(null)
  const adding = ref(false)
  const typed = ref("")
  const field = ref(null)

  const newCharacters = computed(() => addCharacters(font.value, typed.value.replace(/ /g, "")).added)

  const blanks = computed(() => characters.value.filter(char => isBlank(glyphOf(font.value, char))).length)

  function shownLabel(char) {
    return { [CREEPER]: "Creeper", "\u{1F629}": "\u2018", "'": "\u2019", [SPACE_CHAR]: "Space" }[char] ?? char
  }

  function menu(event, char) {
    selected.value = char
    const items = [
      { icon: "copy", label: "Copy", action: () => copyGlyph(char) },
      { icon: "paste", label: "Paste", disabled: !clipboard.value, action: () => pasteGlyph(char) }
    ]
    if (isOptional(char)) items.push({ divider: true }, { icon: "trash", label: "Delete", danger: true, action: () => remove(char) })
    context.value = { at: { x: event.clientX, y: event.clientY }, items }
  }

  function remove(char) {
    update(removeCharacter(font.value, char))
    if (selected.value === char) selected.value = "a"
  }

  function add(text) {
    const { font: next, added } = addCharacters(font.value, text)
    if (!added.length) return
    update(added.reduce((result, char) => result.glyphs[char] || !result.imported?.[char] ? result : setGlyph(result, char, result.imported[char]), next))
    selected.value = added[0]
  }

  async function openAdding() {
    typed.value = ""
    adding.value = true
    await nextTick()
    field.value?.focus()
  }

  function confirmAdding() {
    if (!newCharacters.value.length) return
    adding.value = false
    add(newCharacters.value.join(""))
  }

  function perRow() {
    const tiles = Array.from(list.value?.$el.children ?? [])
    const count = tiles.filter(tile => tile.offsetTop === tiles[0]?.offsetTop).length
    return count === tiles.length ? 0 : Math.max(1, count)
  }

  function reveal() {
    list.value?.$el.children[characters.value.indexOf(selected.value)]?.scrollIntoView({ block: "nearest", inline: "nearest" })
  }

  async function key(event) {
    if (arrowsMove.value !== "list" || adding.value || context.value || event.ctrlKey || event.metaKey || event.altKey || typing(event.target)) return
    const step = ARROWS[event.key] ?? { ArrowUp: -perRow(), ArrowDown: perRow() }[event.key]
    if (!step) return
    event.preventDefault()
    const chars = characters.value
    const next = chars[Math.min(chars.length - 1, Math.max(0, chars.indexOf(selected.value) + step))]
    if (next === undefined || next === selected.value) return
    selected.value = next
    await nextTick()
    reveal()
  }

  function touched(event) {
    if (event.target instanceof Element && event.target.closest("[role=menu]")) return
    arrowsMove.value = section.value?.contains(event.target) ? "list" : "drawing"
  }

  onMounted(() => {
    addEventListener("keydown", key)
    addEventListener("pointerdown", touched, true)
    reveal()
  })
  onBeforeUnmount(() => {
    removeEventListener("keydown", key)
    removeEventListener("pointerdown", touched, true)
  })

  function addMenu(event) {
    const box = event.currentTarget.getBoundingClientRect()
    const items = []
    if (!font.value.creeper) items.push({ icon: "creeper", label: "Creeper face", action: () => add(CREEPER) })
    if (!font.value.defineSpace) items.push({ icon: "space", label: "Space", action: () => add(SPACE_CHAR) })
    if (!items.length) return openAdding()
    items.push({ divider: true }, { icon: "text", label: "Other character", action: openAdding })
    context.value = { at: { x: box.left, y: box.bottom + 4 }, items }
  }
</script>

<template>
  <section ref="section" class="characters">
    <header>
      <h3>Characters</h3>
      <span class="hint">{{ blanks ? `${blanks} still blank` : "All drawn" }}</span>
    </header>
    <TileGrid ref="list" class="list" small :min="52">
      <Tile v-for="char of characters" :key="char" small :label="shownLabel(char)" aspect="auto" :selected="selected === char" :tooltip="characterName(char) === shownLabel(char) ? null : characterName(char)" @pick="selected = char" v-long-press @contextmenu.prevent="menu($event, char)">
        <template #picture><GlyphThumb :font="font" :glyph="glyphOf(font, char)" /></template>
      </Tile>
      <button class="add" v-tooltip="'Add a character'" aria-label="Add a character" @click="addMenu"><Icon name="plus" :size="20" /></button>
    </TileGrid>
    <ContextMenu :items="context?.items" :at="context?.at" @close="context = null" />
    <RenderDialog v-if="adding" title="Add characters" close-title="Cancel" dismissable @close="adding = false">
      <form class="add-form" @submit.prevent="confirmAdding">
        <label class="field">
          <span class="label">Characters</span>
          <input ref="field" v-model="typed" type="text" placeholder="eg ä ö ü" aria-label="Characters to add">
        </label>
        <p class="hint">{{ !typed.trim() ? "Type one or more characters. Capitals are added as lowercase." : newCharacters.length ? `Adds ${newCharacters.join(" ")}` : "Those are all in the font already." }}</p>
        <div class="buttons">
          <div class="spacer"></div>
          <Button @click="adding = false">Cancel</Button>
          <Button primary type="submit" :disabled="!newCharacters.length">Add</Button>
        </div>
      </form>
    </RenderDialog>
  </section>
</template>

<style scoped>
  .characters {
    display: flex;
    flex-direction: column;
    background: var(--surface);
  }

  header {
    flex: none;
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    padding: 12px 12px 8px;
  }

  .list {
    flex: 1;
    align-content: start;
    overflow-y: auto;
    padding: 0 12px 12px;
  }

  .add {
    padding: 0;
    color: var(--muted);
    background: transparent;
    border: 2px dashed var(--line-strong);
  }

  .add:hover {
    color: var(--text);
  }

  .add-form {
    display: flex;
    flex-direction: column;
    gap: 12px;
    width: min(380px, 100%);
    padding: 20px;
  }

  .add-form .hint {
    margin: 0;
  }

  .buttons {
    display: flex;
    gap: 8px;
  }

  @media (max-width: 1000px) {
    header {
      padding: 10px 16px 6px;
    }

    .characters .list {
      grid-template-columns: none;
      grid-auto-flow: column;
      grid-auto-columns: 52px;
      overflow-x: auto;
      overflow-y: hidden;
      padding: 0 16px 10px;
      overscroll-behavior-x: contain;
      scroll-padding: 0 16px;
    }
  }
</style>
