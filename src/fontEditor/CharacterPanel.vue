<script setup>
  import { computed } from "vue"
  import Button from "../components/Button.vue"
  import Field from "../components/Field.vue"
  import Icon from "../components/Icon.vue"
  import NumberInput from "../components/NumberInput.vue"
  import { autoStretch, changeGlyph, characterName, inkCount, setGlyph, squaresOf, widthOf } from "../lib/fontEditor.js"
  import { typedNumber } from "./fields.js"
  import { font, glyph, reshapeSelected, selected, update, updateGlyph } from "./store.js"

  const width = computed(() => widthOf(font.value, glyph.value))
  const overridden = computed(() => glyph.value.width !== null && glyph.value.width !== font.value.width)
  const imported = computed(() => font.value.imported?.[selected.value] ?? null)

  function setNumber(key, event, minimum) {
    const squares = typedNumber(event, squaresOf(font.value, key === "width" ? width.value : glyph.value[key]), value => Number.isInteger(value * font.value.grid) && value * font.value.grid >= minimum)
    if (squares === null) return
    const pixels = squares * font.value.grid
    const next = changeGlyph(font.value, selected.value, { [key]: pixels })
    if (event.type !== "change" && inkCount(next.glyphs[selected.value]) < inkCount(glyph.value)) return
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
    <h3>{{ characterName(selected, font.letterCase) }}</h3>
    <Field group label="Width">
      <div class="input-row">
        <NumberInput min="1" :value="squaresOf(font, width)" aria-label="Character width" @input="setNumber('width', $event, 1)" @change="setNumber('width', $event, 1)" />
        <Button v-if="overridden" v-tooltip="`Go back to the default width of ${squaresOf(font, font.width)}`" @click="resetWidth">Use default</Button>
        <span v-else class="hint">Default width</span>
      </div>
    </Field>
    <div class="pair">
      <Field label="Rows above topline">
        <NumberInput min="0" :value="squaresOf(font, glyph.above)" @input="setNumber('above', $event, 0)" @change="setNumber('above', $event, 0)" />
      </Field>
      <Field label="Rows below baseline">
        <NumberInput min="0" :value="squaresOf(font, glyph.below)" @input="setNumber('below', $event, 0)" @change="setNumber('below', $event, 0)" />
      </Field>
    </div>
    <p class="hint">Height is set for the whole font. For tall or hanging characters, add rows here instead.</p>

    <h3>Stretch zones</h3>
    <p class="hint">Marked rows are the ones that stretch when text is arced, so choose straight parts that won't look odd taller. {{ glyph.stretch.length ? `${glyph.stretch.length} ${glyph.stretch.length === 1 ? "row" : "rows"} marked.` : "No rows marked, so they're marked automatically when you submit the font." }}</p>
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

</style>
