<script setup>
  import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue"
  import { useRoute } from "vue-router"
  import BrandLink from "./BrandLink.vue"
  import Button from "../components/Button.vue"
  import TopBar from "./TopBar.vue"
  import { useWindowEvents } from "../components/composables/events.js"

  const LINKS = [{ to: "/app/presets", label: "Presets" }, { to: "/font-editor/", label: "Font editor" }, { to: "/submit/", label: "Submit" }]

  const props = defineProps({ floating: Boolean })

  const route = useRoute()
  const atTop = ref(scrollY <= 0)
  const scrolled = computed(() => !props.floating || !atTop.value)
  const menu = ref(null)
  const toggle = ref(null)
  const open = ref(false)

  function update() {
    atTop.value = scrollY <= 0
  }

  function home(event) {
    if (route.name !== "home") return
    event.preventDefault()
    scrollTo({ top: 0 })
  }

  function close() {
    open.value = false
  }

  function outside(event) {
    if (!menu.value.contains(event.target)) close()
  }

  function key(event) {
    if (event.key !== "Escape") return
    event.preventDefault()
    close()
    toggle.value.focus()
  }

  useWindowEvents(() => open.value, { resize: close }, { pointerdown: outside, keydown: key })
  watch(() => route.fullPath, close)

  onMounted(() => addEventListener("scroll", update, { passive: true }))
  onBeforeUnmount(() => removeEventListener("scroll", update))
</script>

<template>
  <TopBar class="bar" :class="{ clear: !scrolled }" site>
    <template #brand><BrandLink to="/" @click="home" /></template>
    <nav class="bar-links" aria-label="Main">
      <RouterLink v-for="link of LINKS" :key="link.to" :to="link.to">{{ link.label }}</RouterLink>
    </nav>
    <template #end><Button primary class="bar-button" to="/app/">Open the generator</Button></template>
    <template #after>
      <div ref="menu" class="bar-menu">
        <Button ref="toggle" ghost class="bar-toggle" :class="{ open }" icon="menu" :icon-size="20" aria-label="Menu" :aria-expanded="open" @click="open = !open" />
        <nav v-if="open" class="bar-list popover" aria-label="Menu" @click="close">
          <RouterLink v-for="link of LINKS" :key="link.to" :to="link.to">{{ link.label }}</RouterLink>
          <RouterLink class="bar-generator" to="/app/">Open the generator</RouterLink>
        </nav>
      </div>
    </template>
  </TopBar>
</template>

<style scoped>
  .bar {
    position: fixed;
    top: 0;
    right: 0;
    left: 0;
    z-index: 10;
    line-height: 1.15;
    transition: background-color 0.4s, border-color 0.4s;
  }

  .bar.clear {
    background-color: transparent;
    border-bottom-color: transparent;
  }

  .bar-links {
    display: flex;
    gap: 22px;
  }

  .bar-links a {
    font-size: 15px;
    font-weight: 600;
    text-decoration: none;
    color: var(--muted);
    user-select: none;
    transition: color var(--duration);
  }

  .bar-links a:hover,
  .bar-links a[aria-current] {
    color: var(--text);
  }

  .bar-button {
    white-space: nowrap;
  }

  .bar-menu {
    position: relative;
    display: none;
  }

  .bar-toggle :deep(svg) {
    display: block;
    flex: none;
  }

  .bar .bar-toggle.open {
    --button-text: var(--text);
    background: var(--card);
  }

  .bar .bar-list {
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    display: flex;
    flex-direction: column;
    min-width: 170px;
    padding: 4px;
  }

  .bar .bar-list a {
    display: flex;
    align-items: center;
    min-height: var(--control);
    padding: 0 10px;
    font-size: var(--font-base);
    font-weight: 500;
    white-space: nowrap;
    text-decoration: none;
    color: var(--text);
    user-select: none;
  }

  .bar .bar-list a:hover,
  .bar .bar-list a:focus-visible {
    outline: none;
    background: var(--card-hover);
  }

  .bar .bar-list .bar-generator {
    display: none;
  }

  @media (max-width: 900px) {
    .bar-links {
      display: none;
    }

    .bar-menu {
      display: flex;
    }
  }

  @media (max-width: 600px) {
    .bar-button {
      display: none;
    }

    .bar .bar-list .bar-generator {
      display: flex;
    }
  }
</style>
