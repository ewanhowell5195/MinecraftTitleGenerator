<script setup>
  import { onBeforeUnmount, onMounted, ref } from "vue"
  import { startHero } from "../home/hero.js"
  import Strips from "../home/Strips.vue"
  import { startTyping } from "../home/typing.js"

  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches
  const live = ref(!reduced && !!document.createElement("canvas").getContext("webgl"))
  const canvas = ref(null)
  const stage = ref(null)
  const stats = ref(null)
  const bandTitle = ref(null)
  const total = ref("")
  const week = ref("")
  const loaded = ref(false)
  const leaving = new AbortController()

  function reported(err) {
    if (err.name !== "AbortError") console.error(err)
  }

  async function fetchCounts(path) {
    const response = await fetch(`https://api.wynem.com/${path}`, { signal: leaving.signal })
    if (!response.ok) throw new Error(`failed to load the title stats: ${response.status}`)
    return (await response.json()).filter(entry => !entry.id.includes(".")).reduce((sum, entry) => sum + entry.count, 0)
  }

  async function loadStats() {
    const [all, recent] = await Promise.all([fetchCounts("blockbench/minecrafttitlegenerator/statsall"), fetchCounts("minecrafttitlegenerator/stats")])
    total.value = `${(Math.floor(all / 1e5) / 10).toFixed(1)} million`
    week.value = (Math.floor(recent / 100) * 100).toLocaleString("en-GB")
    loaded.value = true
  }

  onMounted(() => {
    addEventListener("dragstart", event => event.preventDefault(), { signal: leaving.signal })
    const watcher = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return
      watcher.disconnect()
      loadStats().catch(reported)
      if (!reduced) startTyping(bandTitle.value, leaving.signal).catch(reported)
    }, { rootMargin: "400px" })
    watcher.observe(stats.value)
    leaving.signal.addEventListener("abort", () => watcher.disconnect())
    if (live.value) {
      startHero(canvas.value, stage.value, leaving.signal).catch(err => {
        live.value = false
        reported(err)
      })
    }
  })

  onBeforeUnmount(() => leaving.abort())
</script>

<template>
  <main :class="{ live }">
    <section class="hero">
      <div class="glow warm" aria-hidden="true"></div>
      <div class="glow cool" aria-hidden="true"></div>
      <canvas ref="canvas" aria-hidden="true"></canvas>
      <h1 ref="stage" class="stage"><img class="poster" src="/home/logo.webp" alt="Minecraft Title Generator" width="1800" height="524"></h1>
      <p class="lead">Make your own Minecraft style 3D titles, right in your browser!</p>
      <div class="actions">
        <RouterLink class="button" to="/app/">Open the generator</RouterLink>
        <a class="button blue" href="https://ewanhowell.com/plugins/minecraft-title-generator" target="_blank" rel="noopener">Get the Blockbench plugin</a>
        <RouterLink class="button dark" to="/font-editor/">Make a font</RouterLink>
      </div>
    </section>

    <section class="textures">
      <div class="wrap">
        <h2>Over 100 textures to start from</h2>
        <p>Most of them were made by the community. You can also make your own gradient, or tile any block texture from any version of Minecraft.</p>
      </div>
      <div class="strips" aria-hidden="true"><Strips /></div>
    </section>

    <section class="band">
      <div class="wrap">
        <div class="band-text">
          <h2>Make your own title!</h2>
          <dl ref="stats" class="stats" :class="{ loaded }">
            <div><dt>Titles made</dt><dd data-stat="total">{{ total }}</dd></div>
            <div><dt>This week</dt><dd data-stat="week">{{ week }}</dd></div>
          </dl>
          <RouterLink class="button dark" to="/app/">Open the generator</RouterLink>
        </div>
        <div ref="bandTitle" class="band-title" aria-hidden="true"><img src="/home/typing/your-title.webp" alt="" width="1125" height="200" loading="lazy"><canvas></canvas></div>
      </div>
    </section>
  </main>
</template>
