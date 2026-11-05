<script setup>
  import { ref } from "vue"
  import { NAME_LIMIT, loadPreset, presets, removePreset, renamePreset } from "../lib/presets.js"
  import CommunityPresets from "./CommunityPresets.vue"
  import Icon from "./Icon.vue"
  import RenderDialog from "./RenderDialog.vue"
  import Segments from "./Segments.vue"
  import SharePresetDialog from "./SharePresetDialog.vue"
  import SubmissionUsage from "./SubmissionUsage.vue"
  import TitlePicture from "./TitlePicture.vue"

  const TABS = [{ value: "mine", label: "My presets" }, { value: "community", label: "Community" }]

  const emit = defineEmits(["close"])

  const tab = ref(presets.value.length ? "mine" : "community")
  const sharing = ref(null)

  function open(preset) {
    if (loadPreset(preset)) emit("close")
  }

  function rename(preset, event) {
    event.target.value = renamePreset(preset, event.target.value).name
  }

  function remove(preset) {
    if (confirm(`Delete the preset ${preset.name}?`)) removePreset(preset)
  }

  function shared() {
    sharing.value = null
    tab.value = "community"
  }
</script>

<template>
  <RenderDialog title="Presets" close-title="Close" large dismissable @close="sharing || emit('close')">
    <div class="tabs">
      <Segments :options="TABS" v-model="tab" />
      <SubmissionUsage v-if="tab === 'mine' && presets.length" />
    </div>
    <CommunityPresets v-if="tab === 'community'" @close="emit('close')" />
    <p v-else-if="!presets.length" class="empty">You have no presets yet. Use File &gt; Save preset to save the current title here.</p>
    <div v-else class="presets">
      <div v-for="preset of presets" :key="preset.code" class="preset">
        <TitlePicture :code="preset.code" :title="`Open ${preset.name}`" @open="open(preset)" />
        <input class="name" type="text" :value="preset.name" :maxlength="NAME_LIMIT" :aria-label="`Name of ${preset.name}`" spellcheck="false" @change="rename(preset, $event)" @keydown.enter="$event.target.blur()">
        <div class="actions">
          <button v-if="!preset.shared" class="small" @click="sharing = preset"><Icon name="share" :size="14" /><span>Share publicly</span></button>
          <span v-else class="shared">Shared publicly</span>
          <button class="icon-button small" :title="`Delete ${preset.name}`" @click="remove(preset)"><Icon name="trash" :size="14" /></button>
        </div>
      </div>
    </div>
    <SharePresetDialog v-if="sharing" :preset="sharing" @close="sharing = null" @shared="shared" />
  </RenderDialog>
</template>

<style scoped>
  .tabs {
    flex: none;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 16px 20px 0;
  }

  .empty {
    margin: 0;
    padding: 24px 20px;
    font-size: var(--font-md);
    color: var(--muted);
  }

  .presets {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 290px), 1fr));
    align-content: start;
    gap: 10px;
    flex: 1;
    min-height: 0;
    padding: 16px 20px 20px;
    overflow-y: auto;
  }

  .preset {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
    padding: 8px;
    background: var(--card);
  }

  .preset:hover {
    background: var(--card-hover);
  }

  input.name {
    width: 100%;
    padding: 4px;
    font-size: var(--font-sm);
    font-weight: 600;
    text-align: center;
    text-overflow: ellipsis;
    color: var(--muted);
    background: transparent;
  }

  input.name:hover,
  input.name:focus {
    color: var(--text);
  }

  .actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    min-height: 28px;
  }

  .actions .small {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .shared {
    font-size: var(--font-sm);
    color: var(--faint);
    user-select: none;
  }
</style>
