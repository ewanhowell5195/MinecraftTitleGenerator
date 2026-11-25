import { ref } from "vue"
import { presetToAsk, voteOn } from "../state/community.js"

export function useVotePrompt(source, voted) {
  const preset = presetToAsk(source)
  const vote = ref(0)
  const error = ref("")

  async function cast(value) {
    error.value = ""
    try {
      vote.value = (await voteOn(preset.id, value)).vote
      voted(preset)
    } catch (err) {
      error.value = err.message
    }
  }

  return { preset, vote, error, cast }
}
