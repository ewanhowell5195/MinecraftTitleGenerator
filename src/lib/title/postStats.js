export const STATS_API = "https://api.wynem.com"

export async function postStats(stats, headers = {}) {
  const response = await fetch(`${STATS_API}/minecrafttitlegenerator/stats`, { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify(stats) })
  if (!response.ok) throw new Error(`failed to submit the title stats: ${response.status}`)
}
