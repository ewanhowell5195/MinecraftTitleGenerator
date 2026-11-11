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
