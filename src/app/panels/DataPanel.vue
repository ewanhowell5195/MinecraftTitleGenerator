<script setup>
  import { usePanelState } from "../../lib/panels/panel.js"
  import Panel from "../Panel.vue"
  import DataControls from "./DataControls.vue"

  const props = defineProps({
    panel: { type: Object, required: true },
    word: { type: Boolean, default: false }
  })

  const state = usePanelState(props.panel, props.word)
  const { enable, enabled, modified, reset, shown, title } = state
</script>

<template>
  <Panel v-if="shown" :title="title" :enabled="enabled" @update:enabled="enable" :modified="modified" @reset="reset">
    <DataControls :panel="panel" :state="state" :controls="panel.controls" />
  </Panel>
</template>
