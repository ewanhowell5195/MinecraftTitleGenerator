<script setup>
  import { computed } from "vue"
  import { LIMITS } from "../lib/limits.js"
  import Button from "./Button.vue"
  import Icon from "./Icon.vue"

  const STARS = [1, 2, 3, 4, 5]

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
      <Button class="vote upvote" :aria-pressed="mine === 1" @click="emit('vote', 1)" :class="{ chosen: mine === 1 }"><template #icon><Icon name="arrowUp" :size="20" /></template><span>{{ mine === 1 ? "Upvoted" : "Upvote" }}</span></Button>
      <Button class="vote downvote" :aria-pressed="mine === -1" @click="emit('vote', -1)" :class="{ chosen: mine === -1 }"><template #icon><Icon name="arrowDown" :size="20" /></template><span>{{ mine === -1 ? "Downvoted" : "Downvote" }}</span></Button>
    </div>
    <div v-if="rating !== null" class="result" :title="summary">
      <span class="stars" aria-hidden="true">
        <span v-for="star of STARS" :key="star" class="star">
          <Icon class="outline" name="star" :size="16" />
          <span class="filled" :style="{ width: fill(star) }"><Icon name="star" :size="16" /></span>
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
    flex: 1;
    min-height: 48px;
  }

  .upvote:hover,
  .upvote.chosen {
    color: var(--accent);
    background: var(--accent-soft);
    box-shadow: inset 0 0 0 1px var(--accent);
    filter: none;
  }

  .downvote:hover,
  .downvote.chosen {
    color: var(--danger);
    background: var(--danger-soft);
    box-shadow: inset 0 0 0 1px var(--danger);
    filter: none;
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

  .outline {
    color: var(--faint);
  }

  .outline :deep(path) {
    stroke-width: 1.5;
  }

  .filled {
    position: absolute;
    top: 0;
    left: 0;
    display: block;
    height: 16px;
    overflow: hidden;
  }

  .filled :deep(path) {
    fill: #f2c14e;
    stroke: none;
  }

  .unrated {
    margin: 0;
    color: var(--faint);
  }
</style>
