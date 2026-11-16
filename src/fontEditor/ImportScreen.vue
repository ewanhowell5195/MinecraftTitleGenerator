<script setup>
  import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue"
  import Button from "../components/Button.vue"
  import Field from "../components/Field.vue"
  import Icon from "../components/Icon.vue"
  import Notice from "../components/Notice.vue"
  import NumberInput from "../components/NumberInput.vue"
  import Segments from "../components/Segments.vue"
  import { ALWAYS_REQUIRED, LETTER_CASES, REQUIRED_CHARACTERS, CREEPER, charactersOf, chooseCharacters, glyphOf, hasCase, isBlank, setLetterCase } from "../lib/fontEditor.js"
  import SizeStats from "./SizeStats.vue"
  import ResetIcon from "./ResetIcon.vue"
  import { limitSize, resettable } from "./sizeLimit.js"
  import { OPENING_QUOTE } from "../lib/order.js"
  import { startFont } from "./store.js"
  import { glyphsFromSource, withTemplateGlyphs } from "./template.js"
  import { drawTiles, fitCell, tileLine } from "./glyphTiles.js"

  const GAP = 12
  const CHARACTER_SETS = [{ value: "default", label: "Default characters" }, { value: "custom", label: "Custom" }]

  const props = defineProps({
    picked: { type: Object, required: true }
  })

  const height = ref(props.picked.suggested.rows)
  const square = ref(props.picked.suggested.square)
  const { mostRows, mostSquare } = limitSize(height, square)
  const defaults = { height: props.picked.suggested.rows, square: props.picked.suggested.square }
  const { changed, reset } = resettable({ height, square }, defaults, ["height", "square"])
  const letterCase = ref("both")
  const characterSet = ref("default")
  const chosen = ref(REQUIRED_CHARACTERS.filter(char => char !== OPENING_QUOTE && !ALWAYS_REQUIRED.includes(char)).join(""))
  const canvases = []
  const holder = ref(null)
  const empty = ref(false)
  let observer = null
  let frame = 0

  const outline = computed(() => props.picked.kind === "outline")
  const valid = computed(() => [height.value, square.value].every(value => Number.isInteger(value) && value >= 1))
  const pixels = computed(() => valid.value ? height.value * square.value : null)
  const built = computed(() => {
    if (!valid.value) return { error: "Height and square size need to be whole numbers of at least 1." }
    try {
      const font = outline.value ? { ...props.picked.build(props.picked.source, { height: pixels.value, density: square.value }), template: { ...props.picked.template, square: square.value } } : props.picked.build(props.picked.image, { height: pixels.value })
      const cased = setLetterCase({ ...font, grid: square.value }, letterCase.value)
      if (characterSet.value === "default") return { font: cased }
      const { font: kept, added } = chooseCharacters(cased, chosen.value)
      if (!charactersOf(kept).length) return { error: "Type at least one character for the font to have." }
      return { font: outline.value ? withTemplateGlyphs(kept, glyphsFromSource(props.picked.outlineShape, props.picked.source, kept, added, square.value)) : kept }
    } catch (err) {
      return { error: err.message }
    }
  })
  const samples = computed(() => {
    const font = built.value.font
    if (!font) return []
    const drawn = charactersOf(font).filter(char => char !== CREEPER && !isBlank(glyphOf(font, char)))
    const wanted = font.letterCase === "both" ? [["A", "B", "C"], ["a", "b", "c"]] : [["a", "b", "c"]]
    const found = wanted.filter(line => line.every(char => drawn.includes(char)))
    return found.length ? found : [drawn.slice(0, 3)].filter(line => line.length)
  })
  const count = computed(() => built.value.font ? `${charactersOf(built.value.font).length} characters.` : "")

  function draw() {
    const font = built.value.font
    if (!holder.value || !font) return
    empty.value = !samples.value.length
    if (empty.value || samples.value.some((_, index) => !canvases[index])) return
    const lines = samples.value.map(chars => tileLine(font, chars))
    const cell = fitCell(lines, { width: holder.value.clientWidth - 2, gap: GAP })
    lines.forEach((line, index) => drawTiles(canvases[index], font, line, cell, GAP))
  }

  function schedule() {
    if (frame) return
    frame = requestAnimationFrame(() => {
      frame = 0
      draw()
    })
  }

  function confirm() {
    if (built.value.font) startFont(built.value.font)
  }

  onMounted(() => {
    observer = new ResizeObserver(schedule)
    observer.observe(holder.value)
    draw()
  })

  onBeforeUnmount(() => {
    observer.disconnect()
    cancelAnimationFrame(frame)
  })

  watch(samples, async () => {
    await nextTick()
    schedule()
  })

  watch(letterCase, value => {
    chosen.value = Array.from(chosen.value, char => !hasCase(char) ? char : value === "upper" ? char.toUpperCase() : char.toLowerCase()).join("")
  })
</script>

<template>
  <div class="import">
    <div class="intro">
      <h1>Import {{ picked.name }}</h1>
      <p>Choose how it's turned into pixels. The preview updates as you go.</p>
    </div>

    <div class="layout">
      <section class="choice settings">
        <div class="numbers">
          <Field group label="Height" label-for="import-height">
            <template v-if="changed('height')" #label><ResetIcon :title="`Reset to ${defaults.height}`" @reset="reset('height')" /></template>
            <NumberInput id="import-height" min="1" :max="mostRows" v-model.number="height" />
          </Field>
          <Field group label="Square size" label-for="import-square">
            <template v-if="changed('square')" #label><ResetIcon :title="`Reset to ${defaults.square}`" @reset="reset('square')" /></template>
            <NumberInput id="import-square" min="1" :max="mostSquare" v-model.number="square" />
          </Field>
          <SizeStats :pixels="built.font?.height ?? ''" />
        </div>
        <p class="hint">Height counts squares, and square size is pixels per square.</p>
        <Segments radio label="Letter case" :options="LETTER_CASES" v-model="letterCase" />
        <Segments radio label="Characters" :options="CHARACTER_SETS" v-model="characterSet" />
        <Field v-if="characterSet === 'custom'" label="Characters to include">
          <textarea v-model="chosen" rows="4" spellcheck="false"></textarea>
        </Field>
        <p v-if="count" class="hint">{{ count }}</p>
        <Button primary wide class="confirm" :disabled="!built.font" @click="confirm"><template #icon><Icon name="check" /></template>Import</Button>
      </section>

      <section class="choice preview">
        <div ref="holder" class="view">
          <div class="tiles">
            <Notice v-if="built.error" class="error">{{ built.error }}</Notice>
            <template v-else>
              <canvas v-for="(line, index) of samples" :key="index" :ref="element => canvases[index] = element"></canvas>
              <p v-if="empty" class="empty-state">Nothing in this font is drawn yet.</p>
            </template>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
  .import {
    max-width: 1100px;
    margin: 0 auto;
  }

  .intro {
    margin-bottom: 22px;
  }

  h1 {
    margin: 0 0 6px;
    font-size: 28px;
    overflow-wrap: anywhere;
  }

  .intro p {
    margin: 0;
    color: var(--muted);
  }

  .layout {
    display: grid;
    grid-template-columns: minmax(0, 320px) minmax(0, 1fr);
    gap: 14px;
  }

  .choice {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 18px;
    background: var(--surface);
    border: 1px solid var(--line);
  }

  .numbers {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }


  .confirm {
    margin-top: auto;
  }

  .choice.preview {
    background: #fff;
  }

  .view {
    flex: 1;
    min-width: 0;
    min-height: 320px;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .tiles {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    gap: 12px;
  }

  .view canvas {
    display: block;
  }

  @media (max-width: 800px) {
    .layout {
      grid-template-columns: minmax(0, 1fr);
    }

    .preview {
      order: -1;
    }

    .view {
      min-height: 200px;
    }
  }
</style>
