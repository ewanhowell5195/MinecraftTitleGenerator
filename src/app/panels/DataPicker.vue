<script setup>
  import { usePickFloor } from "#lib/panels/pickFloor.js"
  import DataControls from "./DataControls.vue"

  const props = defineProps({
    panel: { type: Object, required: true },
    state: { type: Object, required: true },
    control: { type: Object, required: true }
  })

  const { resolved } = props.state
  const { picker, floor } = usePickFloor(() => resolved(props.control.watch ?? []))
</script>

<template>
  <div ref="picker" class="flow" :class="{ pick: resolved(control.pick), peek: resolved(control.peek) }" :style="resolved(control.floor ?? true) ? { minHeight: `${floor}px` } : null">
    <DataControls :panel="panel" :state="state" :controls="control.controls" />
  </div>
</template>
