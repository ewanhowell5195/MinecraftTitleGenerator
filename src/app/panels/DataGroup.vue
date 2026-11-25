<script setup>
  import { groupState } from "#lib/panels/panel.js"
  import DataControls from "./DataControls.vue"

  const props = defineProps({
    panel: { type: Object, required: true },
    state: { type: Object, required: true },
    control: { type: Object, required: true }
  })

  const own = groupState(props.state, props.control)
</script>

<template>
  <DataControls :panel="panel" :state="own" :controls="control.controls" />
</template>
