<script setup>
import { usePanel } from "../../lib/panel.js"
import { TYPES, applyType, defaultTexture, setTexture } from "../../lib/settings.js"
import { selection, words } from "../../lib/scene.js"
import Panel from "../Panel.vue"
import Slider from "../Slider.vue"

const LAYERS = {
  top: ["top"],
  bottom: ["bottom", "top"],
  small: ["top", "small"]
}

const { object, font, list, modified, reset } = usePanel("placement")

function pick(type) {
  if (object.value.type === type) return
  for (const word of words(selection.value[0])) {
    if (list.value && !word.textureVariant && word.texture === defaultTexture(list.value, word.type)) setTexture(word, { texture: defaultTexture(list.value, type) })
    word.type = type
    if (type !== "top") word.row = Math.max(0, word.row)
    applyType(word, type, font.value)
  }
}
</script>

<template>
  <Panel title="Placement" :modified="modified" @reset="reset">
    <div class="types">
      <div class="type card" v-for="(data, id) of TYPES" :key="id" tabindex="0" @click="pick(id)" @keydown.enter="pick(id)" :class="{ selected: object.type === id }">
        <div class="preview">
          <img v-for="layer of LAYERS[id]" :key="layer" :src="`placement/${id}-${layer}.png`" :class="{ dim: layer !== id }" alt="">
        </div>
        <span class="name">{{ data.name }}</span>
      </div>
    </div>
    <h3>Rows</h3>
    <p class="hint">Stack more lines of the same placement by giving each its own row.</p>
    <Slider label="Row" v-model="object.row" :min="object.type === 'top' ? -3 : 0" :max="3" />
    <Slider v-if="object.row !== 0" label="Row spacing" v-model="object.rowSpacing" :min="-4" :max="20" />
  </Panel>
</template>

<style scoped>
.types {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.type {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 8px 10px;
}

.name {
  font-size: var(--font-md);
  font-weight: 600;
  text-align: center;
  color: var(--muted);
}

.selected .name {
  color: var(--text);
}

.preview {
  display: grid;
}

.preview img {
  grid-area: 1 / 1;
  width: 100%;
}

.preview img.dim {
  opacity: 0.2;
}
</style>
