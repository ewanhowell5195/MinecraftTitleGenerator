<script setup>
  import { canvasLimit } from "../../lib/texture/canvas.js"
  import { framing, setAspect, setResolution } from "../../render/framing.js"
  import Button from "../../components/Button.vue"
  import Field from "../../components/Field.vue"
  import NumberInput from "../../components/NumberInput.vue"

  defineProps({
    panel: { type: Object, required: true },
    context: { type: Object, required: true }
  })

  const max = canvasLimit()
</script>

<template>
  <Field group label="Size">
    <div class="input-row">
      <NumberInput :value="framing.width" min="1" :max="max" aria-label="Width" @input="setResolution('width', $event.target.value)" @change="$event.target.value = framing.width" />
      <span class="times">&times;</span>
      <NumberInput :value="framing.height" min="1" :max="max" aria-label="Height" @input="setResolution('height', $event.target.value)" @change="$event.target.value = framing.height" />
      <Button ghost :active="framing.linked" icon="link" title="Link width and height" :aria-pressed="framing.linked" @click="framing.linked = !framing.linked" />
    </div>
  </Field>
  <Field group label="Aspect ratio">
    <div class="input-row">
      <NumberInput :value="framing.aspectWidth" min="1" :max="max" aria-label="Aspect width" @input="setAspect('aspectWidth', $event.target.value)" @change="$event.target.value = framing.aspectWidth" />
      <span class="times">:</span>
      <NumberInput :value="framing.aspectHeight" min="1" :max="max" aria-label="Aspect height" @input="setAspect('aspectHeight', $event.target.value)" @change="$event.target.value = framing.aspectHeight" />
    </div>
  </Field>
</template>

<style scoped>
  .input-row .number-input {
    flex: 1;
    width: auto;
    min-width: 0;
  }

  .times {
    color: var(--faint);
  }
</style>
