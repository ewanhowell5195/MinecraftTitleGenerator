<script setup>
  import { ref } from "vue"
  import ContextMenu from "./ContextMenu.vue"
  import Icon from "./Icon.vue"

  const props = defineProps({
    label: { type: String, required: true },
    selected: { type: Boolean, default: false },
    image: { type: String, default: null },
    unit: { type: Number, default: null },
    pattern: { type: Object, default: null },
    author: { type: String, default: null },
    badge: { type: Number, default: 0 },
    save: { type: String, default: null },
    keyboard: { type: Boolean, default: false },
    menu: { type: Array, default: null }
  })

  const emit = defineEmits(["pick", "save"])

  const at = ref(null)

  function openMenu(event) {
    if (!props.menu?.length) return
    event.preventDefault()
    at.value = { x: event.clientX, y: event.clientY }
  }
</script>

<template>
  <div class="tile card" :class="{ selected }" :title="author ? `By ${author}` : null" :tabindex="keyboard ? 0 : null" @click="emit('pick')" @keydown.enter="keyboard && emit('pick')" @contextmenu="openMenu">
    <div v-if="image" class="thumb picture"><img :src="image" alt="" :style="unit ? { height: `${unit}px` } : null"></div>
    <div v-else class="thumb pattern" :style="pattern"></div>
    <div :class="{ badged: badge }">{{ label }}</div>
    <svg v-if="badge" class="badge" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" :aria-label="`${badge} variants`">
      <title>{{ badge }} variants</title>
      <path d="M3 7v14h14" />
      <rect x="7" y="3" width="14" height="14" />
      <text x="14" y="10.5" text-anchor="middle" dominant-baseline="central" fill="currentColor" stroke="none" font-size="10" font-weight="700">{{ badge > 9 ? "9+" : badge }}</text>
    </svg>
    <button v-if="save" class="save" @click.stop="emit('save')" :title="save"><Icon name="download" :size="12" /></button>
    <ContextMenu v-if="at" :items="menu" :at="at" @close="at = null" />
  </div>
</template>

<style scoped>
  .tile {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 6px 6px 8px;
    font-size: var(--font-sm);
    font-weight: 600;
    line-height: 1.25;
    text-align: center;
    color: var(--muted);
  }

  .tile:hover,
  .tile.selected {
    color: var(--text);
  }

  .thumb {
    width: 100%;
    aspect-ratio: 288 / 132;
  }

  .thumb.pattern {
    background-color: var(--field);
    background-size: 64px 64px;
    image-rendering: pixelated;
  }

  .badge {
    position: absolute;
    right: 5px;
    bottom: 6px;
  }

  .badged {
    padding: 0 18px;
  }

  .save {
    position: absolute;
    top: 4px;
    left: 4px;
    display: none;
    width: 26px;
    height: 26px;
    padding: 0;
    color: var(--text);
    background: var(--tile-overlay);
  }

  .save:hover {
    background: #000d;
  }

  .tile:hover .save,
  .tile:focus-within .save {
    display: inline-flex;
  }

  @media (hover: none) {
    .save {
      display: inline-flex;
    }
  }
</style>
