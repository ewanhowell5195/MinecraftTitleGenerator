export const WEEK_STATS = "minecrafttitlegenerator/stats"
export const ALL_STATS = "blockbench/minecrafttitlegenerator/statsall"

export async function titleStats(path, signal) {
  const response = await fetch(`https://api.wynem.com/${path}`, { signal })
  if (!response.ok) throw new Error(`failed to load the title stats: ${response.status}`)
  return response.json()
}
