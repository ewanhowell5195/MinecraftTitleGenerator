<script setup>
  import { computed, ref, useAttrs } from "vue"
  import Icon from "./Icon.vue"

  defineOptions({ inheritAttrs: false })

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

  function step(direction) {
    const field = input.value
    if (direction > 0) field.stepUp()
    else field.stepDown()
    field.dispatchEvent(new Event("input", { bubbles: true }))
    field.dispatchEvent(new Event("change", { bubbles: true }))
  }
</script>

<template>
  <span class="number-input" :class="[attrs.class, { disabled }]" :style="attrs.style">
    <input ref="input" type="number" v-bind="inputAttrs" :value="model === undefined ? attrs.value : model" @input="typed">
    <span class="steps">
      <button type="button" tabindex="-1" :disabled="disabled" aria-label="Increase" @click="step(1)"><Icon name="up" :size="12" /></button>
      <button type="button" tabindex="-1" :disabled="disabled" aria-label="Decrease" @click="step(-1)"><Icon name="down" :size="12" /></button>
    </span>
  </span>
</template>

<style scoped>
  .number-input {
    position: relative;
    display: inline-flex;
    width: 72px;
    min-width: 0;
  }

  input {
    width: 100%;
    padding-right: 24px;
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
    box-shadow: none;
  }

  .steps button:hover:not(:disabled) {
    color: var(--text);
    background: var(--card-hover);
    filter: none;
  }
</style>
