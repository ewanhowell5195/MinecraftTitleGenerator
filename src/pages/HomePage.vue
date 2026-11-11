<script setup>
  import { onBeforeUnmount, onMounted, ref } from "vue"
  import { startHero } from "../home/hero.js"
  import Button from "../components/Button.vue"
  import Strips from "../home/Strips.vue"
  import { startTyping } from "../home/typing.js"
  import { TAGLINE } from "../pages.js"
  import { ALL_STATS, WEEK_STATS, titleStats } from "../site/stats.js"

  function hasWebGL() {
    const gl = document.createElement("canvas").getContext("webgl")
    gl?.getExtension("WEBGL_lose_context")?.loseContext()
    return !!gl
  }

  const animated = !matchMedia("(prefers-reduced-motion: reduce)").matches && hasWebGL()
  const live = ref(animated)
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
    return (await titleStats(path, leaving.signal)).filter(entry => !entry.id.includes(".")).reduce((sum, entry) => sum + entry.count, 0)
  }

  async function loadStats() {
    const [all, recent] = await Promise.all([fetchCounts(ALL_STATS), fetchCounts(WEEK_STATS)])
    total.value = `${(Math.floor(all / 1e5) / 10).toFixed(1)} million`
    week.value = (Math.floor(recent / 100) * 100).toLocaleString("en-GB")
    loaded.value = true
  }

  function showPoster() {
    live.value = false
  }

  onMounted(() => {
    addEventListener("dragstart", event => event.preventDefault(), { signal: leaving.signal })
    const watcher = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return
      watcher.disconnect()
      loadStats().catch(reported)
      if (animated) startTyping(bandTitle.value, leaving.signal).catch(reported)
    }, { rootMargin: "400px" })
    watcher.observe(stats.value)
    leaving.signal.addEventListener("abort", () => watcher.disconnect())
    if (animated) {
      startHero(canvas.value, stage.value, leaving.signal, showPoster).catch(err => {
        showPoster()
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
      <canvas v-if="live" ref="canvas" aria-hidden="true"></canvas>
      <h1 ref="stage" class="stage"><img class="poster" src="/home/logo.webp" alt="Minecraft Title Generator" width="1800" height="524"></h1>
      <p class="lead">{{ TAGLINE }}</p>
      <div class="actions">
        <Button primary big to="/app/">Open the generator</Button>
        <Button blue big href="https://ewanhowell.com/plugins/minecraft-title-generator" target="_blank" rel="noopener">Get the Blockbench plugin</Button>
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
          <Button big to="/app/">Open the generator</Button>
        </div>
        <div ref="bandTitle" class="band-title" aria-hidden="true"><img src="/home/typing/your-title.webp" alt="" width="1125" height="200" loading="lazy"><canvas></canvas></div>
      </div>
    </section>
  </main>
</template>
