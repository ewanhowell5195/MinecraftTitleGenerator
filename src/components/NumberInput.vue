<script setup>
  import { computed, ref, useAttrs } from "vue"
  import Icon from "./Icon.vue"

  defineOptions({ inheritAttrs: false })

  defineProps({
    bare: { type: Boolean, default: false }
  })

  const model = defineModel({ type: [Number, String], default: undefined })

  const attrs = useAttrs()
  const input = ref(null)

  const inputAttrs = computed(() => Object.fromEntries(Object.entries(attrs).filter(([key]) => key !== "class" && key !== "style")))
  const disabled = computed(() => attrs.disabled !== undefined && attrs.disabled !== false)

  function typed(event) {
    if (model.value === undefined) return
    const number = event.target.valueAsNumber
    model.value = Number.isNaN(number) ? event.target.value : number
  }

  function filter(event) {
    const text = event.data ?? event.dataTransfer?.getData("text/plain")
    if (text && !/^[0-9.-]+$/.test(text)) event.preventDefault()
  }

  function limit(name, fallback) {
    const value = attrs[name]
    return value === undefined || value === null || value === "" ? fallback : Number(value)
  }

  function correct(event) {
    const field = event.target
    if (field.value === "" && !field.validity.badInput) {
      if (typeof model.value === "number") field.value = model.value
      return
    }
    if (field.value === String(model.value ?? attrs.value)) return
    let next = Number.isNaN(field.valueAsNumber) ? Number(model.value ?? attrs.value) : field.valueAsNumber
    if (Number.isNaN(next)) return
    const min = limit("min", -Infinity)
    const max = limit("max", Infinity)
    if (attrs.step !== "any") {
      const step = limit("step", 1)
      const base = Number.isFinite(min) ? min : 0
      const decimals = String(step).split(".")[1]?.length ?? 0
      next = Number((base + Math.round((next - base) / step) * step).toFixed(decimals))
    }
    next = Math.min(max, Math.max(min, next))
    if (String(next) === field.value) return
    field.value = next
    field.dispatchEvent(new Event("input", { bubbles: true }))
    field.dispatchEvent(new Event("change", { bubbles: true }))
  }

  function step(direction) {
    const field = input.value
    if (direction > 0) field.stepUp()
    else field.stepDown()
    field.dispatchEvent(new Event("input", { bubbles: true }))
    field.dispatchEvent(new Event("change", { bubbles: true }))
  }
</script>

<template>
  <span class="number-input" :class="[attrs.class, { disabled, bare, acting: $slots.action }]" :style="attrs.style">
    <input ref="input" type="number" v-bind="inputAttrs" :value="model === undefined ? attrs.value : model" @beforeinput="filter" @input="typed" @blur="correct" @keydown.enter="input.blur()">
    <span v-if="$slots.action" class="action"><slot name="action"></slot></span>
    <span v-if="!bare" class="steps">
      <button type="button" tabindex="-1" :disabled="disabled" aria-label="Increase" @click="step(1)"><Icon name="up" :size="12" /></button>
      <button type="button" tabindex="-1" :disabled="disabled" aria-label="Decrease" @click="step(-1)"><Icon name="down" :size="12" /></button>
    </span>
  </span>
</template>

<style scoped>
  .number-input {
    position: relative;
    display: inline-flex;
    min-width: 0;
  }

  :where(.number-input) {
    width: 72px;
  }

  input {
    width: 100%;
    padding-right: 24px;
  }

  .bare input {
    padding-right: 10px;
  }

  .acting input {
    padding-right: calc(24px + var(--control));
  }

  .action {
    position: absolute;
    top: 0;
    right: 21px;
    display: flex;
  }

  .steps {
    position: absolute;
    top: 1px;
    right: 1px;
    bottom: 1px;
    display: flex;
    flex-direction: column;
    width: 20px;
  }

  .steps button {
    flex: 1;
    min-height: 0;
    padding: 0;
    color: var(--faint);
    background: transparent;
    border: 0;
  }

  .steps button:hover:not(:disabled) {
    color: var(--text);
    background: var(--card-hover);
  }
</style>
