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
    tooltip: { type: String, default: null },
    badge: { type: Number, default: 0 },
    save: { type: String, default: null },
    faded: { type: Boolean, default: false },
    still: { type: Boolean, default: false },
    small: { type: Boolean, default: false },
    href: { type: String, default: null },
    aspect: { type: String, default: "288 / 132" },
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
  <component :is="href ? 'a' : 'div'" class="tile card" :class="{ selected, faded, still, small }" :href="href" v-tooltip="author ? { text: `By ${author}`, tooltipClass: 'slow' } : tooltip" :tabindex="href || still ? null : 0" @click="still || emit('pick')" @keydown.enter="still || emit('pick')" @contextmenu="openMenu">
    <div v-if="$slots.picture" class="thumb picture" :style="{ aspectRatio: aspect }"><slot name="picture"></slot></div>
    <div v-else-if="image" class="thumb picture" :style="{ aspectRatio: aspect }"><img :src="image" alt="" :style="unit ? { height: `${unit}px` } : null"></div>
    <div v-else class="thumb pattern" :style="[pattern, { aspectRatio: aspect }]"></div>
    <div :class="{ badged: badge }">{{ label }}</div>
    <slot></slot>
    <svg v-if="badge" class="badge" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" :aria-label="`${badge} variants`">
      <title>{{ badge }} variants</title>
      <path d="M3 7v14h14" />
      <rect x="7" y="3" width="14" height="14" />
      <text x="14" y="10.5" text-anchor="middle" dominant-baseline="central" fill="currentColor" stroke="none" font-size="10" font-weight="700">{{ badge > 9 ? "9+" : badge }}</text>
    </svg>
    <button v-if="save" class="save" @click.stop="emit('save')" v-tooltip="save" :aria-label="save"><Icon name="download" :size="12" /></button>
    <ContextMenu v-if="at" :items="menu" :at="at" @close="at = null" />
  </component>
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
    text-decoration: none;
    color: var(--muted);
  }

  .tile:hover:not(.still),
  .tile.selected {
    color: var(--text);
  }

  .tile.small {
    gap: 4px;
    padding: 4px 4px 5px;
    font-size: var(--font-xs);
  }

  .tile.still {
    cursor: default;
  }

  .tile.still:hover {
    background: var(--card);
  }

  .thumb {
    width: 100%;
  }

  .thumb.pattern {
    background-color: var(--field);
    background-size: auto 100%;
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
    width: var(--control-tiny);
    height: var(--control-tiny);
    min-height: var(--control-tiny);
    padding: 0;
    color: var(--text);
    background: var(--tile-overlay);
    box-shadow: none;
  }

  .save:hover {
    background: var(--tile-overlay-hover);
    filter: none;
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
