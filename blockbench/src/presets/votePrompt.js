import { useVotePrompt } from "#lib/presets/votePrompt.js"
import { forgetPreset, sourcePreset } from "../file.js"

export const VotePrompt = {
  setup: () => useVotePrompt(sourcePreset(), forgetPreset),
  template: `
    <div v-if="preset" class="mtg-ask">
      <p v-if="vote">Thanks for voting on {{ preset.name }}!</p>
      <p v-else-if="error" class="mtg-error">{{ error }}</p>
      <p v-else>Made from the <strong>{{ preset.name }}</strong> preset. Was it a good one?</p>
      <div v-if="!vote" class="mtg-row">
        <button class="mtg-button" @click="cast(1)"><i class="material-icons">arrow_upward</i><span>Upvote</span></button>
        <button class="mtg-button" @click="cast(-1)"><i class="material-icons">arrow_downward</i><span>Downvote</span></button>
      </div>
    </div>
  `
}
