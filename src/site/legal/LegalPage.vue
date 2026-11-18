<script setup>
  import { cloneVNode, computed, nextTick, onBeforeUnmount, onMounted, ref, useSlots } from "vue"
  import FluidTabs from "fluid-tabs-vue"

  defineProps({
    title: { type: String, required: true },
    updated: { type: String, required: true },
    about: { type: String, required: true }
  })

  const READ_LINE = 120
  const JUMP_LIMIT = 1500
  const CONTACT = "Contact"

  const slots = useSlots()
  const content = ref(null)
  const sections = computed(() => (slots.default?.() ?? []).filter(isHeading).map(node => node.children).concat(CONTACT).map(label => ({ id: slug(label), label })))
  const current = ref(sections.value[0]?.id ?? "")
  const leaving = new AbortController()
  let following = false
  let jumping = null

  function slug(text) {
    return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
  }

  function isHeading(node) {
    return node.type === "h2" && typeof node.children === "string"
  }

  function Body() {
    return slots.default?.().map(node => isHeading(node) ? cloneVNode(node, { id: slug(node.children) }) : node)
  }

  function headings() {
    return Array.from(content.value.querySelectorAll("h2"))
  }

  function landed() {
    clearTimeout(jumping)
    jumping = null
  }

  function track() {
    if (jumping) return
    const list = headings()
    const bottom = innerHeight + scrollY >= document.documentElement.scrollHeight - 2
    const id = bottom ? list.at(-1)?.id : list.findLast(heading => heading.getBoundingClientRect().top <= READ_LINE)?.id ?? list[0]?.id
    if (!id || id === current.value) return
    following = true
    current.value = id
    nextTick(() => following = false)
  }

  function jump(id) {
    clearTimeout(jumping)
    jumping = setTimeout(landed, JUMP_LIMIT)
    document.getElementById(id).scrollIntoView()
    const url = new URL(location.href)
    url.hash = id
    history.replaceState({ ...history.state, current: `${url.pathname}${url.search}${url.hash}` }, "", url)
  }

  function picked(id) {
    if (!following) jump(id)
  }

  onMounted(() => {
    const target = location.hash && document.getElementById(decodeURIComponent(location.hash.slice(1)))
    if (target) requestAnimationFrame(() => {
      target.scrollIntoView({ behavior: "instant" })
      track()
    })
    addEventListener("scroll", track, { passive: true, signal: leaving.signal })
    addEventListener("scrollend", landed, { signal: leaving.signal })
    track()
  })

  onBeforeUnmount(() => {
    leaving.abort()
    clearTimeout(jumping)
  })
</script>

<template>
  <div class="legal wrap">
    <header class="legal-head">
      <h1 class="page-title">{{ title }}</h1>
      <p class="updated">Last updated: {{ updated }}</p>
    </header>
    <nav v-if="sections.length" class="contents" aria-label="Contents">
      <p>Contents</p>
      <FluidTabs v-model="current" :tabs="sections" tab-style="underline" vertical no-swipe @tab-changed="picked">
        <template #label="{ tab }"><span :class="{ current: tab.id === current }">{{ tab.label }}</span></template>
      </FluidTabs>
    </nav>
    <main ref="content" class="legal-body">
      <Body />

      <h2 :id="slug(CONTACT)">{{ CONTACT }}</h2>
      <p>If you have any questions about {{ about }}, you can contact me:</p>
      <ul>
        <li>On Discord: <a href="https://discord.ewanhowell.com/" target="_blank" rel="noopener">Ewan's Server</a></li>
        <li>By email: <a href="mailto:contact@ewanhowell.com">contact@ewanhowell.com</a></li>
        <li>On GitHub: <a href="https://github.com/ewanhowell5195/MinecraftTitleGenerator/issues" target="_blank" rel="noopener">Open an issue</a></li>
      </ul>
    </main>
  </div>
</template>
