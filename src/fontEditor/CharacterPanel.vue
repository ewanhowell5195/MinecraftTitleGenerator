<script setup>
  import { computed } from "vue"
  import Button from "../components/Button.vue"
  import Icon from "../components/Icon.vue"
  import NumberInput from "../components/NumberInput.vue"
  import { autoStretch, changeGlyph, characterName, setGlyph, squaresOf, widthOf } from "../lib/fontEditor.js"
  import { font, glyph, reshapeSelected, selected, update, updateGlyph } from "./store.js"

  const width = computed(() => widthOf(font.value, glyph.value))
  const overridden = computed(() => glyph.value.width !== null && glyph.value.width !== font.value.width)
  const imported = computed(() => font.value.imported?.[selected.value] ?? null)

  function ink(target) {
    return target.rows.join("").split("1").length - 1
  }

  function setNumber(key, event, minimum) {
    const final = event.type === "change"
    const pixels = event.target.valueAsNumber * font.value.grid
    if (!Number.isInteger(pixels) || pixels < minimum) {
      if (final) event.target.value = squaresOf(font.value, key === "width" ? width.value : glyph.value[key])
      return
    }
    const next = changeGlyph(font.value, selected.value, { [key]: pixels })
    if (!final && ink(next.glyphs[selected.value]) < ink(glyph.value)) return
    reshapeSelected({ [key]: pixels }, `${selected.value}.${key}`)
  }

  function resetWidth() {
    reshapeSelected({ width: font.value.width })
  }

  function revert() {
    update(setGlyph(font.value, selected.value, imported.value))
  }

  function mark() {
    update(autoStretch(font.value, [selected.value]))
  }

  function clearMarks() {
    updateGlyph({ ...glyph.value, stretch: [] })
  }
</script>

<template>
  <div class="flow">
    <h3>{{ characterName(selected) }}</h3>
    <div class="field">
      <span class="label">Width</span>
      <div class="input-row">
        <NumberInput min="1" :value="squaresOf(font, width)" aria-label="Character width" @input="setNumber('width', $event, 1)" @change="setNumber('width', $event, 1)" />
        <Button v-if="overridden" v-tooltip="`Go back to the default width of ${squaresOf(font, font.width)}`" @click="resetWidth">Use default</Button>
        <span v-else class="hint">Default width</span>
      </div>
    </div>
    <div class="pair">
      <label class="field">
        <span class="label">Rows above topline</span>
        <NumberInput min="0" :value="squaresOf(font, glyph.above)" @input="setNumber('above', $event, 0)" @change="setNumber('above', $event, 0)" />
      </label>
      <label class="field">
        <span class="label">Rows below baseline</span>
        <NumberInput min="0" :value="squaresOf(font, glyph.below)" @input="setNumber('below', $event, 0)" @change="setNumber('below', $event, 0)" />
      </label>
    </div>
    <p class="hint">Height is set for the whole font. For tall or hanging characters, add rows here instead.</p>

    <h3>Stretch zones</h3>
    <p class="hint">Marked rows are the ones that stretch when text is arced, so choose straight parts that won't look odd taller. {{ glyph.stretch.length ? `${glyph.stretch.length} ${glyph.stretch.length === 1 ? "row" : "rows"} marked.` : "No rows marked." }}</p>
    <div class="row">
      <Button @click="mark"><template #icon><Icon name="wand" :size="14" /></template>Mark automatically</Button>
      <Button :disabled="!glyph.stretch.length" @click="clearMarks">Clear</Button>
    </div>

    <template v-if="imported">
      <h3>Imported shape</h3>
      <Button @click="revert"><template #icon><Icon name="reset" :size="14" /></template>Back to the imported character</Button>
    </template>
  </div>
</template>

<style scoped>
  .pair {
    display: grid;
    grid-template-columns: 1fr 1fr;
    align-items: end;
    gap: 10px;
  }

  .pair .number-input {
    width: 100%;
  }
</style>
