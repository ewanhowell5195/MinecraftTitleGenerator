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

  const summary = computed(() => `${Math.round(props.rating * 20)}% upvoted`)

  function fill(star) {
    return `${Math.min(1, Math.max(0, props.rating - star + 1)) * 100}%`
  }
</script>

<template>
  <div class="rating">
    <div v-if="!own" class="votes">
      <button type="button" class="vote upvote" :class="{ chosen: mine === 1 }" :aria-pressed="mine === 1" @click="emit('vote', 1)"><Icon name="arrowUp" :size="20" /><span>{{ mine === 1 ? "Upvoted" : "Upvote" }}</span></button>
      <button type="button" class="vote downvote" :class="{ chosen: mine === -1 }" :aria-pressed="mine === -1" @click="emit('vote', -1)"><Icon name="arrowDown" :size="20" /><span>{{ mine === -1 ? "Downvoted" : "Downvote" }}</span></button>
    </div>
    <div v-if="rating !== null" class="result" :title="summary">
      <span class="stars" aria-hidden="true">
        <span v-for="star of STARS" :key="star" class="star">
          <svg class="outline" viewBox="0 0 24 24" width="16" height="16"><path :d="PATH" /></svg>
          <span class="filled" :style="{ width: fill(star) }"><svg viewBox="0 0 24 24" width="16" height="16"><path :d="PATH" /></svg></span>
        </span>
      </span>
      <strong>{{ rating.toFixed(1) }}</strong>
      <span>from {{ votes }} votes</span>
    </div>
    <p v-else class="unrated">{{ votes }} of {{ LIMITS.minVotes }} votes needed for a rating</p>
  </div>
</template>

<style scoped>
  .rating {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-width: 0;
    font-size: var(--font-md);
    font-variant-numeric: tabular-nums;
    color: var(--muted);
  }

  .votes {
    display: flex;
    gap: 8px;
  }

  .vote {
    display: flex;
    flex: 1;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: 48px;
    font-size: var(--font-base);
    font-weight: 600;
    color: var(--text);
    background: var(--card);
    border: 1px solid var(--line-strong);
    user-select: none;
  }

  .upvote:hover {
    color: var(--accent);
    background: var(--accent-soft);
    border-color: var(--accent);
  }

  .downvote:hover {
    color: var(--danger);
    background: #2c1513;
    border-color: var(--danger);
  }

  .upvote.chosen {
    color: var(--accent);
    background: var(--accent-soft);
    border-color: var(--accent);
  }

  .downvote.chosen {
    color: var(--danger);
    background: #2c1513;
    border-color: var(--danger);
  }

  .result {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .result strong {
    color: var(--text);
  }

  .stars {
    display: flex;
    gap: 1px;
  }

  .star {
    position: relative;
    display: block;
    width: 16px;
    height: 16px;
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
    height: 16px;
    overflow: hidden;
  }

  .filled path {
    fill: #f2c14e;
  }

  .unrated {
    margin: 0;
    color: var(--faint);
  }
</style>
