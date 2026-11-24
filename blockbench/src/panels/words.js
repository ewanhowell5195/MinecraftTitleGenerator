import { kindOf, selected, selectedElements } from "../host.js"
import { titleState } from "../titles.js"
import { beginEdit, edit, finishEdit } from "../undo.js"
import { addWord, homeElement, removeWord, splitAt } from "../words.js"
import { INPUTS } from "./inputs.js"

const TARGETS = [{ value: "line", label: "Whole line" }, { value: "word", label: "Current word" }]

let lastWord = null

export const TitleWords = {
  components: INPUTS,
  data: () => ({ TARGETS }),
  computed: {
    home: () => selected.value && homeElement(selected.value),
    kind: () => selected.value && kindOf(selected.value),
    words() {
      return titleState().list.value && this.home.words.length ? this.home.words.slice() : [this.home]
    },
    several() {
      return this.kind !== "text"
    },
    current: () => selected.value
  },
  watch: {
    kind: {
      immediate: true,
      handler() {
        if (this.kind === "word") lastWord = selected.value.uuid
      }
    }
  },
  methods: {
    target(kind) {
      const word = kind === "word" && (this.words.find(({ uuid }) => uuid === lastWord) ?? this.words[0])
      this.choose(word || this.home)
    },
    choose(element) {
      if (element.selected && Outliner.selected.length === 1) return
      element.clickSelect({})
    },
    focus(word) {
      if (this.kind === "word" && word !== selected.value) this.choose(word)
    },
    type(event, word) {
      beginEdit(selectedElements(), `text-${word.uuid}`)
      word.settings.text = event.target.value
    },
    done() {
      finishEdit("Change title text")
    },
    space(word) {
      edit(selectedElements(), "Change title spacing", () => (word.settings.spaceBefore = !word.settings.spaceBefore))
    },
    field(word) {
      return this.$refs.fields[this.words.indexOf(word)]
    },
    add() {
      const field = this.$refs.fields.find(input => input === document.activeElement)
      const at = this.$refs.fields.indexOf(field)
      if (field && splitAt(this.words[at], field.selectionStart, field.selectionEnd)) return
      const word = addWord(this.home)
      this.$nextTick(() => this.field(word)?.select())
    },
    remove(word) {
      removeWord(word)
    },
    backspace(event, word) {
      if (word.settings.text || !this.several) return
      event.preventDefault()
      const index = this.words.indexOf(word)
      removeWord(word)
      this.$nextTick(() => this.$refs.fields[Math.max(0, index - 1)]?.focus())
    }
  },
  template: `
    <section class="mtg-group">
      <div class="mtg-head"><h3>{{ several ? "Words" : "Text" }}</h3></div>
      <div class="mtg-controls">
        <segments-control v-if="several" :options="TARGETS" :value="kind" @change="target" />
        <div v-for="(word, index) of words" :key="word.uuid" class="mtg-row mtg-word">
          <div v-if="index" class="tool" :class="{ enabled: !word.settings.spaceBefore }" :title="word.settings.spaceBefore ? 'Join words' : 'Add space'" @click="space(word)"><i class="material-icons">{{ word.settings.spaceBefore ? "space_bar" : "link" }}</i></div>
          <span v-else-if="several" class="mtg-space"></span>
          <input ref="fields" type="text" class="dark_bordered mtg-text" :class="{ 'mtg-chosen': kind === 'word' && word === current }" :value="word.settings.text" :placeholder="several ? 'word' : 'Type your title'" spellcheck="false" @focus="focus(word)" @input="type($event, word)" @change="done" @blur="done" @keydown.delete="backspace($event, word)">
          <div v-if="several" class="tool" title="Remove this word" @click="remove(word)"><i class="material-icons">clear</i></div>
        </div>
        <button class="mtg-button" @mousedown.prevent @click="add">Add word</button>
        <p class="mtg-hint">Each word gets its own texture. Highlight part of a word and press Add word to split it off.</p>
      </div>
    </section>
  `
}

export const FontNote = {
  template: `<p class="mtg-hint mtg-none">The font and spacing are set for the whole line.</p>`
}
