<script setup>
  import { computed, ref, toRaw } from "vue"
  import Button from "../components/Button.vue"
  import Icon from "../components/Icon.vue"
  import { collisionAmount, pairRank, suggestKerning } from "../lib/kerning.js"
  import { normalise } from "../lib/layout.js"
  import Slider from "../components/Slider.vue"
  import PairView from "./PairView.vue"
  import { previewFont } from "./textCanvas.js"
  import { font, update } from "./store.js"

  const FILTERS = [{ id: "all", label: "Everything", ranks: [0, 1, 2, 3, 4] }, { id: "letters", label: "Letters", ranks: [0] }, { id: "numbers", label: "Numbers", ranks: [1, 2] }, { id: "symbols", label: "Symbols", ranks: [3, 4] }]
  const LABELS = { "\u{1F633}": "A", "\u{1F629}": "\u2018", "'": "\u2019" }

  const custom = ref("")
  const filter = ref("all")
  const customError = ref("")
  const search = ref("")

  const parsed = computed(() => previewFont(toRaw(font.value)))
  const unit = computed(() => font.value.grid * font.value.density)
  const query = computed(() => {
    const text = search.value.replace(/\s/g, "")
    return new Set(Array.from(normalise(text)).concat(Array.from(text)))
  })
  const allPairs = computed(() => Object.entries(font.value.kerning).map(([pair, amount]) => ({ pair, amount, max: maxFor(pair) })).sort((a, b) => pairRank(a.pair) - pairRank(b.pair) || a.pair.localeCompare(b.pair)))
  const pairs = computed(() => allPairs.value.filter(({ pair }) => matches(pair)))

  function matches(pair) {
    return !query.value.size || Array.from(pair).concat(Array.from(pairLabel(pair))).some(char => query.value.has(char))
  }

  function maxFor(pair) {
    return collisionAmount(parsed.value.glyphs, pair, parsed.value.border) ?? 0
  }
  const everySuggestion = computed(() => suggestKerning(parsed.value.glyphs, { capHeight: parsed.value.capHeight, unit: unit.value, border: parsed.value.border }))
  const suggestedAmounts = computed(() => new Map(everySuggestion.value.map(({ pair, amount }) => [pair, amount])))
  const allSuggestions = computed(() => everySuggestion.value.filter(({ pair }) => !(pair in font.value.kerning)))
  const suggestions = computed(() => {
    const { ranks } = FILTERS.find(item => item.id === filter.value)
    return allSuggestions.value.filter(({ pair }) => ranks.includes(pairRank(pair)) && matches(pair))
  })

  function pairLabel(pair) {
    return Array.from(pair, char => LABELS[char] ?? char).join("")
  }

  function setKerning(changes, key = null) {
    const kerning = { ...font.value.kerning }
    for (const [pair, amount] of Object.entries(changes)) {
      if (amount) kerning[pair] = amount
      else delete kerning[pair]
    }
    update({ ...font.value, kerning }, key)
  }

  function setAmount(pair, wanted, max) {
    const value = Math.min(max, Math.max(0, wanted))
    if (Number.isInteger(value)) update({ ...font.value, kerning: { ...font.value.kerning, [pair]: value } }, `kerning.${pair}`)
  }

  function remove(pair) {
    setKerning({ [pair]: 0 })
  }

  function addCustom() {
    const chars = Array.from(normalise(custom.value))
    if (chars.length !== 2) {
      customError.value = "Type exactly two characters."
      return
    }
    const pair = chars.join("")
    if (!parsed.value.glyphs[chars[0]]?.width || !parsed.value.glyphs[chars[1]]?.width) {
      customError.value = "Draw both characters first."
      return
    }
    customError.value = ""
    custom.value = ""
    if (!(pair in font.value.kerning)) setKerning({ [pair]: allSuggestions.value.find(item => item.pair === pair)?.amount ?? unit.value })
  }

  function addAll() {
    setKerning(Object.fromEntries(suggestions.value.map(({ pair, amount }) => [pair, amount])))
  }
</script>

<template>
  <div class="kerning">
    <div class="input-row">
      <input v-model="search" type="text" placeholder="Filter by characters, eg minecraft" aria-label="Search pairs" spellcheck="false">
    </div>
    <div class="columns">
      <section class="flow">
        <h3>Your pairs</h3>
        <p class="hint">Each pair is pulled closer together by its amount, in pixels.</p>
        <form class="input-row" @submit.prevent="addCustom">
          <input v-model="custom" type="text" maxlength="4" placeholder="Any two characters" aria-label="Pair to add">
          <Button type="submit"><template #icon><Icon name="plus" :size="14" /></template>Add pair</Button>
        </form>
        <p v-if="customError" class="hint bad">{{ customError }}</p>
        <p v-if="!allPairs.length" class="hint">None yet. Add some from the suggestions, or type your own.</p>
        <p v-else-if="!pairs.length" class="hint">None of your pairs match this search.</p>
        <div v-else class="rows list">
          <div v-for="{ pair, amount, max } of pairs" :key="pair" class="pair-row">
            <div class="picture big"><PairView :parsed="parsed" :pair="pair" :amount="amount" :width="200" :height="88" :max-scale="6" /></div>
            <div class="tools">
              <div class="head">
                <span class="pair-name">{{ pairLabel(pair) }}</span>
                <div class="spacer"></div>
                <Button ghost v-if="suggestedAmounts.has(pair) && suggestedAmounts.get(pair) !== amount" :title="`Reset to the suggested ${suggestedAmounts.get(pair)}`" :aria-label="`Reset ${pairLabel(pair)} to the suggested ${suggestedAmounts.get(pair)}`" @click="setAmount(pair, suggestedAmounts.get(pair), max)"><template #icon><Icon name="reset" :size="14" /></template></Button>
                <Button ghost :title="`Remove ${pairLabel(pair)}`" :aria-label="`Remove ${pairLabel(pair)}`" @click="remove(pair)"><template #icon><Icon name="close" :size="14" /></template></Button>
              </div>
              <Slider label="Closer by" :min="0" :max="max" :model-value="amount" @update:model-value="setAmount(pair, $event, max)" />
            </div>
          </div>
        </div>
      </section>

      <section class="flow">
        <h3>Suggested</h3>
        <p class="hint">Pairs whose shapes leave room to move closer. Click one to add it.</p>
        <div class="row toolbar">
          <Button :active="filter === item.id" v-for="item of FILTERS" :key="item.id" @click="filter = item.id">{{ item.label }}</Button>
          <div class="spacer"></div>
          <Button :disabled="!suggestions.length" @click="addAll">Add all {{ suggestions.length }}</Button>
        </div>
        <p v-if="!suggestions.length" class="hint">No suggestions here.</p>
        <div v-else class="pairs list">
          <button v-for="{ pair, amount } of suggestions" :key="pair" class="pair suggestion" :title="`Add, ${amount} closer`" @click="setKerning({ [pair]: amount })">
            <span class="picture"><PairView :parsed="parsed" :pair="pair" :amount="amount" /></span>
            <span class="name">{{ pairLabel(pair) }}</span>
          </button>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
  .kerning {
    display: flex;
    flex-direction: column;
    gap: 16px;
    height: 100%;
  }

  .columns {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 28px;
  }

  .columns > section {
    min-height: 0;
  }

  .columns > section > * {
    flex: none;
  }

  .columns > section > .list {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    align-content: start;
  }

  .pairs {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 6px;
  }

  .pair {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 6px;
    padding: 6px;
    background: var(--card);
    border: 1px solid transparent;
    box-shadow: none;
  }

  .picture {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 64px;
    background: var(--checker);
  }

  .rows {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .pair-row {
    display: flex;
    gap: 14px;
    padding: 10px;
    background: var(--card);
  }

  .picture.big {
    flex: none;
    width: 216px;
    height: 104px;
  }

  .tools {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 14px;
    min-width: 0;
  }

  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .pair-name {
    font-size: var(--font-md);
    font-weight: 600;
  }

  .suggestion {
    cursor: pointer;
    user-select: none;
  }

  .suggestion:hover {
    background: var(--card-hover);
    border-color: var(--accent);
    filter: none;
  }

  .name {
    font-size: var(--font-sm);
    text-align: center;
    color: var(--muted);
  }

  .toolbar {
    flex-wrap: wrap;
    gap: 4px;
  }

  @media (max-width: 900px) {
    .columns {
      grid-template-columns: minmax(0, 1fr);
      height: auto;
    }

    .columns > section > .list {
      max-height: 70svh;
    }
  }

  @media (max-width: 520px) {
    .pair-row {
      flex-direction: column;
      gap: 10px;
    }

    .picture.big {
      width: 100%;
    }
  }
</style>
