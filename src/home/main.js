import { createApp } from "vue"
import { startHero } from "./hero.js"
import Strips from "./Strips.vue"
import { startTyping } from "./typing.js"

const root = document.documentElement
const canvas = document.querySelector(".hero canvas")
const stage = document.querySelector(".stage")
const bar = document.querySelector(".bar")

function updateBar() {
  bar.classList.toggle("scrolled", scrollY > 0)
}

async function fetchCounts(path) {
  const response = await fetch(`https://api.wynem.com/${path}`)
  if (!response.ok) throw new Error(`failed to load the title stats: ${response.status}`)
  return (await response.json()).filter(entry => !entry.id.includes(".")).reduce((total, entry) => total + entry.count, 0)
}

async function loadStats() {
  const [total, week] = await Promise.all([fetchCounts("blockbench/minecrafttitlegenerator/statsall"), fetchCounts("minecrafttitlegenerator/stats")])
  document.querySelector("[data-stat=total]").textContent = `${(Math.floor(total / 1e5) / 10).toFixed(1)} million`
  document.querySelector("[data-stat=week]").textContent = (Math.floor(week / 100) * 100).toLocaleString("en-GB")
  document.querySelector(".stats").classList.add("loaded")
}

const statsWatcher = new IntersectionObserver(([entry]) => {
  if (!entry.isIntersecting) return
  statsWatcher.disconnect()
  loadStats().catch(console.error)
  if (!matchMedia("(prefers-reduced-motion: reduce)").matches) startTyping(document.querySelector(".band-title")).catch(console.error)
}, { rootMargin: "400px" })
statsWatcher.observe(document.querySelector(".stats"))

createApp(Strips).mount(".strips")

updateBar()
addEventListener("scroll", updateBar, { passive: true })

addEventListener("dragstart", event => event.preventDefault())

document.querySelector(".brand").addEventListener("click", event => {
  event.preventDefault()
  scrollTo({ top: 0 })
})

if (root.classList.contains("live")) {
  startHero(canvas, stage).catch(error => {
    root.classList.remove("live")
    throw error
  })
}
