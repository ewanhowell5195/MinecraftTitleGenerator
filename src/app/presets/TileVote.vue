<script setup>
  import Button from "#c/Button.vue"
  import Icon from "#c/Icon.vue"

  defineProps({
    mine: { type: Number, default: 0 }
  })

  const emit = defineEmits(["vote"])
</script>

<template>
  <div class="tile-vote" @click.stop @keydown.stop>
    <Button class="arrow" :active="mine === 1" :aria-pressed="mine === 1" :title="mine === 1 ? 'Upvoted' : 'Upvote'" @click="emit('vote', 1)"><template #icon><Icon name="arrowUp" :size="16" /></template></Button>
    <Button class="arrow" :class="{ negative: mine === -1 }" :active="mine === -1" :aria-pressed="mine === -1" :title="mine === -1 ? 'Downvoted' : 'Downvote'" @click="emit('vote', -1)"><template #icon><Icon name="arrowDown" :size="16" /></template></Button>
  </div>
</template>

<style scoped>
  .tile-vote {
    display: flex;
    flex: none;
    gap: 4px;
  }

  .tile-vote .arrow {
    width: var(--control-tiny);
    min-height: var(--control-tiny);
    height: var(--control-tiny);
  }
</style>
