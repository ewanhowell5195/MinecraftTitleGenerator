<script setup>
  import { computed, onBeforeUnmount, onMounted, ref } from "vue"
  import { useRoute } from "vue-router"
  import AccountMenu from "../components/AccountMenu.vue"
  import Button from "../components/Button.vue"
  import NotificationBell from "../components/NotificationBell.vue"

  const props = defineProps({ floating: Boolean })

  const route = useRoute()
  const atTop = ref(scrollY <= 0)
  const scrolled = computed(() => !props.floating || !atTop.value)

  function update() {
    atTop.value = scrollY <= 0
  }

  function home(event) {
    if (route.name !== "home") return
    event.preventDefault()
    scrollTo({ top: 0 })
  }

  onMounted(() => addEventListener("scroll", update, { passive: true }))
  onBeforeUnmount(() => removeEventListener("scroll", update))
</script>

<template>
  <header class="bar" :class="{ scrolled }">
    <RouterLink class="brand" to="/" @click="home"><img src="/favicon.svg" alt="" width="28" height="28"><span>Minecraft Title Generator</span></RouterLink>
    <nav class="bar-links" aria-label="Main">
      <RouterLink to="/app/presets">Presets</RouterLink>
      <RouterLink to="/font-editor/">Font editor</RouterLink>
      <RouterLink to="/submit/">Submit</RouterLink>
    </nav>
    <div class="bar-end">
      <Button primary class="bar-button" to="/app/">Open the generator</Button>
      <div class="bar-account"><AccountMenu /></div>
      <div class="bar-notifications"><NotificationBell /></div>
    </div>
  </header>
</template>
