import { scene } from "./scene.js"
import { loadCounts } from "../title/popularity.js"
import { STATS_API, postStats } from "../title/postStats.js"
import { titleStats } from "../title/statIds.js"

let submitted = null

export function loadStats() {
  return loadCounts(`${STATS_API}/minecrafttitlegenerator/stats`)
}

export async function submitStats() {
  if (import.meta.env.DEV) return
  const title = JSON.stringify(scene.objects)
  const { ids, minecraft } = titleStats(scene.objects)
  if (title === submitted || !ids.length) return
  submitted = title
  try {
    await postStats(minecraft.length ? { ids, minecraft } : { ids })
  } catch (err) {
    if (submitted === title) submitted = null
    console.error(err)
  }
}
