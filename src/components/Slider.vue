<script setup>
  import { computed, onUpdated, ref } from "vue"
  import { clamp } from "../lib/maths.js"

  const props = defineProps({
    label: { type: String, required: true },
    min: { type: Number, required: true },
    max: { type: Number, required: true },
    step: { type: Number, default: 1 },
    steps: { type: Array, default: null },
    log: { type: Boolean, default: false },
    inline: { type: Boolean, default: false },
    disabled: { type: Boolean, default: false }
  })

  const SPAN = 1000

  const value = defineModel({ type: Number, required: true })
  const range = ref(null)

  const position = computed({
    get: () => props.log ? clamp(Math.round(Math.log(value.value / props.min) / Math.log(props.max / props.min) * SPAN), 0, SPAN) : value.value,
    set: at => value.value = props.log ? Math.round(props.min * (props.max / props.min) ** (at / SPAN) / props.step) * props.step : at
  })

  // the value is applied before a raised max, so the browser clamps it to the old max
  onUpdated(() => {
    if (range.value) range.value.value = position.value
  })

  function nearest(number) {
    return props.steps.reduce((best, step, index) => Math.abs(step - number) < Math.abs(props.steps[best] - number) ? index : best, 0)
  }

  const index = computed({
    get: () => nearest(value.value),
    set: at => value.value = props.steps[at]
  })

  function percent(number) {
    return clamp((number - props.min) / (props.max - props.min) * 100, 0, 100)
  }

  const fill = computed(() => {
    if (props.steps) return { "--from": "0%", "--to": `${index.value / (props.steps.length - 1) * 100}%` }
    if (props.log) return { "--from": "0%", "--to": `${position.value / SPAN * 100}%` }
    const origin = percent(clamp(0, props.min, props.max))
    const current = percent(value.value)
    return { "--from": `${Math.min(origin, current)}%`, "--to": `${Math.max(origin, current)}%` }
  })

  function typed(event) {
    if (!Number.isNaN(event.target.valueAsNumber)) value.value = props.steps[nearest(event.target.valueAsNumber)]
    event.target.value = +value.value.toFixed(2)
  }
</script>

<template>
  <div class="slider" :class="{ inline }">
    <span class="label">{{ label }}</span>
    <template v-if="steps">
      <input class="value" type="number" :value="+value.toFixed(2)" :min="min" :max="max" step="any" :aria-label="label" :disabled="disabled" @change="typed">
      <input class="range" type="range" v-model.number="index" min="0" :max="steps.length - 1" step="1" :style="fill" :aria-label="label" :disabled="disabled">
    </template>
    <template v-else>
      <input class="value" type="number" v-model.number="value" :min="min" :max="max" :step="step" :aria-label="label" :disabled="disabled">
      <input ref="range" class="range" type="range" v-model.number="position" :min="log ? 0 : min" :max="log ? SPAN : max" :step="log ? 1 : step" :style="fill" :aria-label="label" :disabled="disabled">
    </template>
  </div>
</template>

<style scoped>
  .slider {
    display: grid;
    grid-template-columns: 1fr auto;
    grid-template-areas: "label value" "range range";
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

  .inline .label {
    font-weight: 700;
    color: var(--faint);
  }

  .value {
    grid-area: value;
    width: 64px;
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
</style>
