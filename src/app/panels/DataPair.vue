<script setup>
  import { computed } from "vue"
  import Button from "#c/Button.vue"
  import Field from "#c/Field.vue"
  import NumberInput from "#c/NumberInput.vue"

  const props = defineProps({
    control: { type: Object, required: true }
  })

  const linked = computed(() => !!props.control.link?.read())
</script>

<template>
  <Field group :label="control.label">
    <div class="input-row">
      <template v-for="(side, index) of control.sides" :key="side.label">
        <span v-if="index" class="times">{{ control.between }}</span>
        <NumberInput :value="side.read()" min="1" :max="side.max()" :aria-label="side.label" @input="side.write($event.target.value)" @change="$event.target.value = side.read()" />
      </template>
      <Button v-if="control.link" ghost :active="linked" icon="link" :title="control.link.title" :aria-pressed="linked" @click="control.link.toggle()" />
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
