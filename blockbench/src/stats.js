import { loadCounts } from "../../src/lib/title/popularity.js"
import { minecraftStatId, titleStats } from "../../src/lib/title/statIds.js"
import { isTitle } from "./elements.js"
import { FORMAT } from "./format.js"

const API = "https://api.wynem.com"
const HEADERS = { source: "blockbench" }
const COUNTED = "minecraft_title_counted"

let property = null

function inDevelopment() {
  return Plugins.all.some(plugin => plugin.id === "minecraft_title_generator" && plugin.installed && plugin.source === "file")
}

function countedIn(project) {
  return project[COUNTED] ?? []
}

function settingsIn(project) {
  return project.elements.filter(element => isTitle(element) && !element.words.length).map(element => element.settings)
}

function uncounted(project, objects) {
  const { ids, minecraft } = titleStats(objects)
  const isNew = id => !countedIn(project).includes(id)
  return { ids: ids.filter(isNew), minecraft: minecraft.filter(({ texture }) => isNew(minecraftStatId(texture))) }
}

function keysOf({ ids, minecraft }) {
  return ids.concat(minecraft.map(({ texture }) => minecraftStatId(texture)))
}

export async function sendStats(project, objects = settingsIn(project)) {
  if (inDevelopment()) return
  const stats = uncounted(project, objects)
  const keys = keysOf(stats)
  if (!keys.length) return
  project[COUNTED] = countedIn(project).concat(keys)
  try {
    const response = await fetch(`${API}/minecrafttitlegenerator/stats`, { method: "POST", headers: { ...HEADERS, "Content-Type": "application/json" }, body: JSON.stringify(stats) })
    if (!response.ok) throw new Error(`failed to submit the title stats: ${response.status}`)
  } catch (err) {
    project[COUNTED] = countedIn(project).filter(key => !keys.includes(key))
    console.error(err)
  }
}

export function savedStats({ project, saved }) {
  if (saved && project.format?.id === FORMAT) sendStats(project)
}

export function countedInFile() {
  return inDevelopment() ? countedIn(Project) : countedIn(Project).concat(keysOf(uncounted(Project, settingsIn(Project))))
}

export function restoreCounted(keys = []) {
  Project[COUNTED] = keys.slice()
}

export function keepCounted({ model }) {
  if (Format?.id === FORMAT) model[COUNTED] = countedInFile()
}

export function registerStats() {
  property = new Property(ModelProject, "array", COUNTED, { condition: { formats: [FORMAT] } })
  loadCounts(`${API}/blockbench/minecrafttitlegenerator/stats`, { headers: HEADERS }).catch(err => console.error(err))
}

export function unregisterStats() {
  property.delete()
}
