<script setup>
  import { computed } from "vue"
  import { LIMITS } from "../lib/limits.js"
  import Icon from "./Icon.vue"

  const STARS = [1, 2, 3, 4, 5]
  const PATH = "M12 2.5l2.9 6.2 6.8.8-5 4.6 1.3 6.7-6-3.3-6 3.3 1.3-6.7-5-4.6 6.8-.8z"

  const props = defineProps({
    rating: { type: Number, default: null },
    votes: { type: Number, required: true },
    mine: { type: Number, default: 0 },
    own: { type: Boolean, default: false }
  })

  const emit = defineEmits(["vote"])

  const summary = computed(() => {
    if (props.rating === null) return `Needs ${LIMITS.minVotes} votes for a rating. It has ${props.votes}.`
    return `${Math.round(props.rating * 20)}% liked this, from ${props.votes} votes`
  })

  function fill(star) {
    return `${Math.min(1, Math.max(0, props.rating - star + 1)) * 100}%`
  }
</script>

<template>
  <div class="rating">
    <button type="button" class="icon-button small" :class="{ up: mine === 1 }" :disabled="own" :title="own ? 'You shared this' : mine === 1 ? 'You like this' : 'I like this'" aria-label="I like this" :aria-pressed="mine === 1" @click="emit('vote', 1)"><Icon name="up" :size="16" /></button>
    <button type="button" class="icon-button small" :class="{ down: mine === -1 }" :disabled="own" :title="own ? 'You shared this' : mine === -1 ? 'You don\'t like this' : 'I don\'t like this'" aria-label="I don't like this" :aria-pressed="mine === -1" @click="emit('vote', -1)"><Icon name="down" :size="16" /></button>
    <div v-if="rating !== null" class="result" :title="summary">
      <span class="stars" aria-hidden="true">
        <span v-for="star of STARS" :key="star" class="star">
          <svg class="outline" viewBox="0 0 24 24" width="13" height="13"><path :d="PATH" /></svg>
          <span class="filled" :style="{ width: fill(star) }"><svg viewBox="0 0 24 24" width="13" height="13"><path :d="PATH" /></svg></span>
        </span>
      </span>
      <span class="number">{{ rating.toFixed(1) }}</span>
    </div>
    <span v-else class="unrated" :title="summary">{{ votes }}/{{ LIMITS.minVotes }} votes</span>
  </div>
</template>

<style scoped>
  .rating {
    display: flex;
    align-items: center;
    gap: 2px;
    min-width: 0;
    font-size: var(--font-sm);
    font-variant-numeric: tabular-nums;
    color: var(--muted);
  }

  .up {
    color: var(--accent);
    background: var(--accent-soft);
  }

  .down {
    color: var(--danger);
    background: #2c1513;
  }

  .result {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-left: 4px;
  }

  .stars {
    display: flex;
  }

  .star {
    position: relative;
    display: block;
    width: 13px;
    height: 13px;
  }

  svg {
    display: block;
    flex: none;
  }

  .outline path {
    fill: none;
    stroke: var(--faint);
    stroke-width: 1.5;
    stroke-linejoin: round;
  }

  .filled {
    position: absolute;
    top: 0;
    left: 0;
    display: block;
    height: 13px;
    overflow: hidden;
  }

  .filled path {
    fill: #f2c14e;
  }

  .unrated {
    margin-left: 4px;
    color: var(--faint);
    white-space: nowrap;
  }
</style>
