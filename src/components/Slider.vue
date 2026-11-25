<script setup>
  import { computed, onUpdated, ref } from "vue"
  import { nearestStep, sliderFill, sliderPosition, sliderRange, sliderValue } from "../lib/panels/slider.js"
  import NumberInput from "./NumberInput.vue"

  const props = defineProps({
    label: { type: String, required: true },
    min: { type: Number, required: true },
    max: { type: Number, required: true },
    typedMin: { type: Number, default: undefined },
    typedMax: { type: Number, default: undefined },
    step: { type: Number, default: 1 },
    steps: { type: Array, default: null },
    log: { type: Boolean, default: false },
    inline: { type: Boolean, default: false },
    hint: { type: String, default: "" }
  })

  const value = defineModel({ type: Number, required: true })
  const range = ref(null)

  const bounds = computed(() => sliderRange(props))
  const fill = computed(() => sliderFill(props, value.value))
  const position = computed({
    get: () => sliderPosition(props, value.value),
    set: at => (value.value = sliderValue(props, at))
  })

  // the value is applied before a raised max, so the browser clamps it to the old max
  onUpdated(() => {
    if (range.value) range.value.value = position.value
  })

  function entered(next) {
    if (typeof next === "number") value.value = next
  }

  function typed(event) {
    if (!Number.isNaN(event.target.valueAsNumber)) value.value = props.steps[nearestStep(props.steps, event.target.valueAsNumber)]
    event.target.value = +value.value.toFixed(2)
  }
</script>

<template>
  <div class="slider" :class="{ inline }">
    <span class="label">{{ label }}</span>
    <NumberInput v-if="steps" bare class="value" :value="+value.toFixed(2)" :min="min" :max="max" step="any" :aria-label="label" @change="typed" />
    <NumberInput v-else bare class="value" :model-value="value" @update:model-value="entered" :min="typedMin === undefined ? min : typedMin" :max="typedMax === undefined ? max : typedMax" :step="step" :aria-label="label" />
    <input ref="range" class="range" type="range" v-model.number="position" :min="bounds.min" :max="bounds.max" :step="bounds.step" :style="fill" :aria-label="label">
    <span v-if="hint" class="hint">{{ hint }}</span>
  </div>
</template>

<style scoped>
  .slider {
    display: grid;
    grid-template-columns: 1fr auto;
    grid-template-areas: "label value" "range range" "hint hint";
    align-items: center;
    row-gap: 2px;
  }

  .slider.inline {
    grid-template-columns: 22px 1fr auto;
    grid-template-areas: "label range value";
    column-gap: 10px;
  }

  .label {
    grid-area: label;
  }

  .hint {
    grid-area: hint;
    margin-top: 4px;
    line-height: 1.4;
  }

  .inline .label {
    font-weight: 700;
    color: var(--faint);
  }

  .slider .value {
    grid-area: value;
    width: 64px;
  }

  .value :deep(input) {
    min-height: var(--control-tiny);
    padding: 0 8px;
    font-size: var(--font-md);
    font-weight: 600;
    text-align: right;
    background: transparent;
  }

  .range {
    grid-area: range;
    width: 100%;
    height: 26px;
    margin: 0;
    background: transparent;
    cursor: pointer;
    -webkit-appearance: none;
    appearance: none;
    --track: linear-gradient(to right, var(--line-strong) var(--from), var(--accent) var(--from), var(--accent) var(--to), var(--line-strong) var(--to));
  }

  .range:focus {
    outline: none;
  }

  .range::-webkit-slider-runnable-track {
    height: 6px;
    background: var(--track);
    border-radius: 0;
  }

  .range::-moz-range-track {
    height: 6px;
    background: var(--track);
    border-radius: 0;
  }

  .range::-webkit-slider-thumb {
    width: 14px;
    height: 18px;
    margin-top: -6px;
    background: var(--knob);
    border: none;
    border-radius: 0;
    box-shadow: var(--knob-shadow);
    -webkit-appearance: none;
  }

  .range::-moz-range-thumb {
    width: 14px;
    height: 18px;
    background: var(--knob);
    border: none;
    border-radius: 0;
    box-shadow: var(--knob-shadow);
  }

  .range:hover::-webkit-slider-thumb,
  .range:focus-visible::-webkit-slider-thumb {
    background: #e6e8ec;
  }

  .range:focus-visible::-webkit-slider-thumb {
    box-shadow: 0 0 0 4px var(--accent-soft), 0 1px 4px #0008;
  }

  .range:hover::-moz-range-thumb,
  .range:focus-visible::-moz-range-thumb {
    background: #e6e8ec;
  }

  .range:focus-visible::-moz-range-thumb {
    box-shadow: 0 0 0 4px var(--accent-soft), 0 1px 4px #0008;
  }
</style>
