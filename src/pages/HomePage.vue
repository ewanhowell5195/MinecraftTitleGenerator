<script setup>
  import { onBeforeUnmount, onMounted, ref } from "vue"
  import people from "virtual:people"
  import { startHero } from "../home/hero.js"
  import Button from "../components/Button.vue"
  import { pictureUrl } from "../lib/pictures.js"
  import Strips from "../home/Strips.vue"
  import UserName from "../components/UserName.vue"
  import { startTyping } from "../home/typing.js"
  import { TAGLINE } from "../pages.js"
  import { ALL_STATS, WEEK_STATS, titleStats } from "../site/stats.js"

  const POPULAR_COUNT = 6
  const MAKERS_SHOWN = 30
  const makers = people.slice(0, MAKERS_SHOWN)

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
  const popular = ref(null)
  const presetList = ref(null)
  const leaving = new AbortController()

  async function loadPopular() {
    const response = await fetch("/api/presets?sort=week&offset=0", { signal: leaving.signal })
    if (!response.ok) throw new Error(`the popular presets could not be loaded (${response.status})`)
    popular.value = (await response.json()).presets.slice(0, POPULAR_COUNT)
  }

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

  function whenNear(element, start) {
    const watcher = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return
      watcher.disconnect()
      start()
    }, { rootMargin: "400px" })
    watcher.observe(element)
    leaving.signal.addEventListener("abort", () => watcher.disconnect())
  }

  onMounted(() => {
    addEventListener("dragstart", event => event.preventDefault(), { signal: leaving.signal })
    whenNear(presetList.value, () => loadPopular().catch(reported))
    whenNear(stats.value, () => {
      loadStats().catch(reported)
      if (animated) startTyping(bandTitle.value, leaving.signal).catch(reported)
    })
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

    <section class="popular">
      <div class="wrap">
        <div class="section-head">
          <div>
            <h2>Popular this week</h2>
            <p>Titles other people have shared. Open any of them in the generator and make it your own.</p>
          </div>
          <Button big to="/app/presets">Browse all presets</Button>
        </div>
        <ol ref="presetList" class="preset-grid">
          <template v-if="popular">
            <li v-for="preset of popular" :key="preset.id">
              <a class="preset" :href="`/app/presets/${preset.id}`">
                <span class="preset-picture"><img :src="pictureUrl(preset)" alt="" loading="lazy"></span>
                <span class="preset-name">{{ preset.name }}</span>
                <span class="preset-author">by <UserName v-if="preset.author" :name="preset.author" :provider="preset.authorProvider" :size="13" /><template v-else>the community</template></span>
              </a>
            </li>
          </template>
          <li v-else v-for="index of POPULAR_COUNT" :key="index" class="placeholder" aria-hidden="true"><span class="preset-picture"></span></li>
        </ol>
      </div>
    </section>

    <section class="editor">
      <div class="wrap">
        <div class="editor-text">
          <h2>Make your own font</h2>
          <p>Draw every letter one square at a time, or import a font file and tidy it up. Use it in your titles straight away, or submit it so everyone can.</p>
          <div class="section-actions">
            <Button primary big to="/font-editor/">Open the font editor</Button>
            <Button big to="/submit/">Submit a font</Button>
          </div>
        </div>
        <img class="section-shot" src="/home/font-editor.webp" alt="The font editor, drawing the M of a copy of Minecraft Ten" width="1440" height="880" loading="lazy">
      </div>
    </section>

    <section class="community">
      <div class="wrap">
        <ul class="makers" aria-label="Some of the people who made the generator's fonts, textures and shapes">
          <li v-for="(name, index) of makers" :key="name" :class="{ top: index < 6 }">{{ name }}</li>
          <li v-if="people.length > makers.length" class="more"><a href="/credits/">+{{ people.length - makers.length }} more</a></li>
        </ul>
        <div class="community-text">
          <h2>Made by the community</h2>
          <p>{{ people.length }} people have made the fonts, textures and shapes in the generator. Made one yourself? Submit it, and once it's accepted it shows up for everyone.</p>
          <div class="section-actions">
            <Button primary big to="/submit/">Submit your own</Button>
            <Button big to="/credits/">See the credits</Button>
          </div>
        </div>
      </div>
    </section>

    <section class="plugin">
      <div class="wrap">
        <div class="plugin-text">
          <h2>Use it in Blockbench</h2>
          <p>The Blockbench plugin is an older version of the title generator, and is missing a lot of what the website can do. It builds your title as a real model though, so for now it is still the more customisable option. You can move any letter, paint over the textures, and render it in high quality from any angle.</p>
          <div class="section-actions">
            <Button blue big href="https://ewanhowell.com/plugins/minecraft-title-generator" target="_blank" rel="noopener">Get the Blockbench plugin</Button>
          </div>
        </div>
        <img class="section-shot" src="/home/blockbench.webp" alt="The Minecraft Title Generator logo as a model in Blockbench" width="1440" height="774" loading="lazy">
      </div>
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
