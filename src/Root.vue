<script setup>
  import { computed } from "vue"
  import { useRoute } from "vue-router"
  import SiteFooter from "./site/SiteFooter.vue"
  import SiteHeader from "./site/SiteHeader.vue"
  import { pageKey } from "./site/routes.js"

  const route = useRoute()
  const page = computed(() => route.meta)
  const key = computed(() => pageKey(route))
</script>

<template>
  <SiteHeader v-if="page.header" :floating="page.header === 'floating'" />
  <RouterView :key="key" />
  <SiteFooter v-if="page.footer" />
</template>
