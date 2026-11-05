<script setup>
  import { NAME_LIMIT, loadPreset, presets, removePreset, renamePreset } from "../lib/presets.js"
  import Icon from "./Icon.vue"
  import RenderDialog from "./RenderDialog.vue"
  import TitlePicture from "./TitlePicture.vue"

  const emit = defineEmits(["close"])


  function open(preset) {
    if (loadPreset(preset)) emit("close")
  }

  function rename(preset, event) {
    event.target.value = renamePreset(preset, event.target.value).name
  }

  function remove(preset) {
    if (confirm(`Delete the preset ${preset.name}?`)) removePreset(preset)
  }
</script>

<template>
  <RenderDialog title="Presets" close-title="Close" large dismissable @close="emit('close')">
    <p v-if="!presets.length" class="empty">You have no presets yet. Use File &gt; Save preset to save the current title here.</p>
    <div v-else class="presets">
      <div v-for="preset of presets" :key="preset.code" class="preset">
        <TitlePicture :code="preset.code" :title="`Open ${preset.name}`" @open="open(preset)" />
        <input class="name" type="text" :value="preset.name" :maxlength="NAME_LIMIT" :aria-label="`Name of ${preset.name}`" spellcheck="false" @change="rename(preset, $event)" @keydown.enter="$event.target.blur()">
        <div class="actions">
          <button class="icon-button small" :title="`Delete ${preset.name}`" @click="remove(preset)"><Icon name="trash" :size="14" /></button>
        </div>
      </div>
    </div>
  </RenderDialog>
</template>

<style scoped>
  .empty {
    margin: 0;
    padding: 24px 20px;
    font-size: var(--font-md);
    color: var(--muted);
  }

  .presets {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
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
    justify-content: flex-end;
    gap: 6px;
    min-height: 28px;
  }
</style>
