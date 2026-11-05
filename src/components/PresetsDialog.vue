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
  const renaming = ref(null)

  const vSelected = {
    mounted(field) {
      field.focus()
      field.select()
    }
  }

  function open(preset) {
    if (loadPreset(preset)) emit("close")
  }

  function finishRenaming(preset, event) {
    if (renaming.value !== preset.code) return
    renaming.value = null
    renamePreset(preset, event.target.value)
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
        <input v-if="renaming === preset.code" v-selected class="name" type="text" :value="preset.name" :maxlength="NAME_LIMIT" :aria-label="`Name of ${preset.name}`" spellcheck="false" @blur="finishRenaming(preset, $event)" @keydown.enter="$event.target.blur()" @keydown.esc.stop="renaming = null">
        <strong v-else class="name" :title="preset.name">{{ preset.name }}</strong>
        <div class="actions">
          <button v-if="!preset.shared" class="small" @click="sharing = preset"><Icon name="share" :size="14" /><span>Share publicly</span></button>
          <span v-else class="shared">Shared publicly</span>
          <div class="icons">
            <button class="icon-button small" :title="`Rename ${preset.name}`" @click="renaming = preset.code"><Icon name="pencil" :size="14" /></button>
            <button class="icon-button small" :title="`Delete ${preset.name}`" @click="remove(preset)"><Icon name="trash" :size="14" /></button>
          </div>
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

  .name {
    display: block;
    width: 100%;
    padding: 6px 8px;
    overflow: hidden;
    font-size: var(--font-sm);
    font-weight: 600;
    line-height: 1.4;
    white-space: nowrap;
    text-overflow: ellipsis;
    border: 1px solid transparent;
  }

  input.name {
    border-color: var(--line-strong);
  }

  .icons {
    display: flex;
    gap: 2px;
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
