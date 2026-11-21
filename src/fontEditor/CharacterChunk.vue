<script setup>
  import { codeOf } from "../lib/font/editor/coverage.js"

  const props = defineProps({
    chars: { type: Array, required: true },
    tile: { type: Function, required: true },
    picture: { type: Function, default: null }
  })

  function drawing(char) {
    return props.picture?.(char) ?? null
  }
</script>

<template>
  <div class="chunk">
    <button v-for="char of chars" :key="char" type="button" class="char" v-bind="tile(char)" :data-char="char" :aria-label="`${char} ${codeOf(char)}`"><img v-if="drawing(char)" class="picture" :src="drawing(char).src" :style="{ width: `${drawing(char).width}px`, height: `${drawing(char).height}px` }" alt=""><template v-else>{{ char }}</template></button>
  </div>
</template>

<style scoped>
  .chunk {
    display: contents;
  }

  .char {
    height: 44px;
    padding: 0;
    font: inherit;
    font-size: 24px;
    line-height: 1;
    color: var(--text);
    background: var(--card);
    border: 1px solid var(--line);
    user-select: none;
  }

  .picture {
    display: block;
    max-width: 100%;
    max-height: 100%;
    margin: auto;
    object-fit: contain;
    image-rendering: pixelated;
    pointer-events: none;
  }

  .char:hover {
    background: var(--card-hover);
  }

  .char.on {
    background: var(--accent-soft);
    border-color: var(--accent);
  }

  .char.forced {
    color: var(--muted);
    cursor: default;
    opacity: 0.55;
  }

  .char.kept {
    color: var(--muted);
    background: transparent;
    border-style: dashed;
    cursor: default;
    opacity: 1;
  }
</style>
