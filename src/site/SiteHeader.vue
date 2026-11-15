<script setup>
  import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue"
  import { useRoute } from "vue-router"
  import AccountMenu from "../components/AccountMenu.vue"
  import Button from "../components/Button.vue"
  import NotificationBell from "../components/NotificationBell.vue"
  import { useWindowEvents } from "../lib/events.js"

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
  <header class="bar" :class="{ scrolled }">
    <RouterLink class="brand" to="/" @click="home"><img src="/favicon.svg" alt="" width="28" height="28"><span>Minecraft Title Generator</span></RouterLink>
    <nav class="bar-links" aria-label="Main">
      <RouterLink v-for="link of LINKS" :key="link.to" :to="link.to">{{ link.label }}</RouterLink>
    </nav>
    <div class="bar-end">
      <Button primary class="bar-button" to="/app/">Open the generator</Button>
      <div class="bar-account"><AccountMenu /></div>
      <div class="bar-notifications"><NotificationBell /></div>
      <div ref="menu" class="bar-menu">
        <Button ref="toggle" ghost class="bar-toggle" :class="{ open }" icon="menu" :icon-size="20" aria-label="Menu" :aria-expanded="open" @click="open = !open" />
        <nav v-if="open" class="bar-list popover" aria-label="Menu" @click="close">
          <RouterLink v-for="link of LINKS" :key="link.to" :to="link.to">{{ link.label }}</RouterLink>
          <RouterLink class="bar-generator" to="/app/">Open the generator</RouterLink>
        </nav>
      </div>
    </div>
  </header>
</template>

<style scoped>
  .bar {
    position: fixed;
    top: 0;
    right: 0;
    left: 0;
    z-index: 10;
    display: flex;
    align-items: center;
    gap: 28px;
    height: 64px;
    padding: 0 max(16px, calc((100% - 1120px) / 2));
    font-family: var(--font-ui);
    line-height: 1.15;
    border-bottom: 1px solid transparent;
    transition: background-color 0.4s, border-color 0.4s;
  }

  .bar.scrolled {
    background-color: var(--surface);
    border-bottom-color: var(--line);
  }

  .bar .brand {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 10px;
    font-size: 17px;
    font-weight: 700;
    text-decoration: none;
    color: var(--text);
    user-select: none;
  }

  .bar .brand img {
    flex: none;
    translate: 0 7%;
  }

  .bar .brand span {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
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

  .bar-end {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-left: auto;
  }

  .bar-notifications,
  .bar-account {
    display: flex;
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
    .bar {
      gap: 12px;
    }

    .bar-end {
      gap: 8px;
    }

    .bar-button,
    .bar-account :deep(.account:not(.signed) span) {
      display: none;
    }

    .bar .bar-list .bar-generator {
      display: flex;
    }
  }
</style>
