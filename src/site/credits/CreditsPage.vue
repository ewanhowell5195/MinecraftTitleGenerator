<script setup>
  import { onBeforeUnmount, onMounted, ref, watch } from "vue"
  import { useRoute } from "vue-router"
  import credits from "virtual:credits"
  import NavTabs from "../../components/NavTabs.vue"
  import { startCredits } from "./credits.js"

  const TABS = [{ id: "contributors", label: "Contributors" }, { id: "fonts", label: "Licensed Fonts" }]

  const root = ref(null)
  const tab = ref(useRoute().query.tab === "fonts" ? "fonts" : "contributors")
  const leaving = new AbortController()

  watch(tab, value => {
    const url = new URL(location.href)
    if (value === "fonts") url.searchParams.set("tab", value)
    else url.searchParams.delete("tab")
    history.replaceState({ ...history.state, current: `${url.pathname}${url.search}${url.hash}` }, "", url)
  })

  onMounted(() => startCredits(root.value, leaving.signal))
  onBeforeUnmount(() => leaving.abort())
</script>

<template>
  <main ref="root" class="credits">
    <section class="intro wrap">
      <div v-html="credits.intro"></div>
      <NavTabs class="tabs" :tabs="TABS" v-model="tab" />
    </section>
    <div v-show="tab === 'contributors'" v-html="credits.contributors"></div>
    <div v-show="tab === 'fonts'" v-html="credits.fonts"></div>
    <div v-html="credits.libraries"></div>
  </main>
</template>
