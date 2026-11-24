import { scene } from "./scene.js"
import { loadCounts } from "../title/popularity.js"
import { titleStats } from "../title/statIds.js"

const API = "https://api.wynem.com/minecrafttitlegenerator/stats"

let submitted = null

export function loadStats() {
  return loadCounts(API)
}

export async function submitStats() {
  if (import.meta.env.DEV) return
  const title = JSON.stringify(scene.objects)
  const { ids, minecraft } = titleStats(scene.objects)
  if (title === submitted || !ids.length) return
  submitted = title
  try {
    const response = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(minecraft.length ? { ids, minecraft } : { ids }) })
    if (!response.ok) throw new Error(`failed to submit the title stats: ${response.status}`)
  } catch (err) {
    if (submitted === title) submitted = null
    console.error(err)
  }
}
