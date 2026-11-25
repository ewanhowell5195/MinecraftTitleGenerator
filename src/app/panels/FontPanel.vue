<script setup>
  import { ref } from "vue"
  import { FONT_PANEL } from "#lib/panels/fontSource.js"
  import { usePanelState } from "#lib/panels/panel.js"
  import Button from "#c/Button.vue"
  import Panel from "../Panel.vue"
  import DataControls from "./DataControls.vue"
  import FontBrowser from "./FontBrowser.vue"
  import FontInfoDialog from "./FontInfoDialog.vue"

  const info = ref(false)
  const state = usePanelState(FONT_PANEL)
  const { modified, reset, title } = state
  const { browsed, browsing, customName, entry, font, object, search, tab, usingCustom } = state.context.state
</script>

<template>
  <Panel :title="title" :modified="modified" @reset="reset">
    <template #actions>
      <Button ghost icon="info" title="Font info and characters" :disabled="!font" @click="info = true" />
    </template>
    <FontInfoDialog v-if="info && font" :font="font" :title="entry?.name || customName || 'Font'" @close="info = false" />
    <FontBrowser v-if="browsing" v-model:search="search" :kind="tab" :current="tab === 'google' ? (usingCustom ? object.customFont.google : null) : object.font" @pick="browsed" @close="browsing = false" />
    <DataControls :panel="FONT_PANEL" :state="state" :controls="FONT_PANEL.controls" />
  </Panel>
</template>
