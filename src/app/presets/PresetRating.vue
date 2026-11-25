<script setup>
  import Button from "#c/Button.vue"
  import GoldStar from "./GoldStar.vue"
  import Icon from "#c/Icon.vue"
  import { ratingText, toGoText, upvotedText, votesText } from "#lib/presets/presetText.js"

  const STARS = [1, 2, 3, 4, 5]

  defineProps({
    rating: { type: Number, default: null },
    votes: { type: Number, required: true },
    mine: { type: Number, default: 0 },
    own: { type: Boolean, default: false }
  })

  const emit = defineEmits(["vote"])
</script>

<template>
  <div class="rating">
    <div v-if="!own" class="votes">
      <Button class="vote" :active="mine === 1" :aria-pressed="mine === 1" @click="emit('vote', 1)"><template #icon><Icon name="arrowUp" :size="16" /></template><span>{{ mine === 1 ? "Upvoted" : "Upvote" }}</span></Button>
      <Button class="vote" :class="{ negative: mine === -1 }" :active="mine === -1" :aria-pressed="mine === -1" @click="emit('vote', -1)"><template #icon><Icon name="arrowDown" :size="16" /></template><span>{{ mine === -1 ? "Downvoted" : "Downvote" }}</span></Button>
    </div>
    <div v-if="rating !== null" class="result" v-tooltip="upvotedText(rating)">
      <span class="stars" :style="{ '--rating': ratingText(rating) }" aria-hidden="true">
        <span v-for="star of STARS" :key="star" class="star" :style="{ '--star': star }">
          <Icon class="outline" name="star" :size="16" />
          <span class="filled"><GoldStar :size="16" /></span>
        </span>
      </span>
      <strong>{{ ratingText(rating) }}</strong>
      <span>{{ votesText(votes) }}</span>
    </div>
    <p v-else class="unrated">{{ toGoText(votes) }}</p>
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
    width: calc(clamp(0, var(--rating) - var(--star) + 1, 1) * 100%);
    height: 16px;
    overflow: hidden;
    transition: width 0.4s ease-out;
  }

  @media (prefers-reduced-motion: reduce) {
    .filled {
      transition: none;
    }
  }

  .unrated {
    margin: 0;
    color: var(--faint);
  }
</style>
