<script setup>
  import { useVotePrompt } from "#lib/presets/votePrompt.js"
  import { scene } from "#lib/state/scene.js"
  import Button from "#c/Button.vue"
  import Icon from "#c/Icon.vue"

  const { preset, vote, error, cast } = useVotePrompt(scene.preset, ({ id }) => {
    if (scene.preset?.id === id) scene.preset = null
  })
</script>

<template>
  <div v-if="preset" class="ask" role="status">
    <p v-if="vote">Thanks for voting on {{ preset.name }}!</p>
    <p v-else-if="error">{{ error }}</p>
    <p v-else>Made from the <strong>{{ preset.name }}</strong> preset. Was it a good one?</p>
    <div v-if="!vote" class="buttons">
      <Button @click="cast(1)"><template #icon><Icon name="arrowUp" :size="16" /></template><span>Upvote</span></Button>
      <Button @click="cast(-1)"><template #icon><Icon name="arrowDown" :size="16" /></template><span>Downvote</span></Button>
    </div>
  </div>
</template>

<style scoped>
  .ask {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 10px 16px;
    min-height: calc(var(--control) + 20px);
    padding: 10px 12px;
    font-size: var(--font-md);
    color: var(--muted);
    border: 1px solid var(--line-strong);
  }

  .ask p {
    margin: 0;
  }

  .ask strong {
    color: var(--text);
  }

  .buttons {
    display: flex;
    gap: 8px;
  }
</style>
