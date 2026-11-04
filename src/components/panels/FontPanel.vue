<script setup>
  import { computed, ref } from "vue"
  import { usePanel } from "../../lib/panel.js"
  import { library } from "../../lib/scene.js"
  import { popular } from "../../lib/stats.js"
  import { fontThumbnail } from "../../lib/ui.js"
  import Icon from "../Icon.vue"
  import Panel from "../Panel.vue"
  import Tile from "../Tile.vue"
  import Toggle from "../Toggle.vue"

  const info = ref(false)
  const { object, font, modified, reset } = usePanel("font")
  const hasTerminators = computed(() => font.value && font.value.glyphs["┫"] && font.value.glyphs["┣"] && !font.value.forcedTerminators)
  const terminators = usePanel("terminators")
  const entry = computed(() => library.fonts.find(item => item.id === object.value.font))
  const baseId = computed(() => entry.value?.variant ?? object.value.font)
  const baseFonts = computed(() => popular(library.fonts.filter(item => !item.variant), item => item.id))
  const variants = computed(() => popular(library.fonts.filter(item => item.variant === baseId.value), item => item.id))

  const characters = computed(() => {
    if (!font.value) return ""
    const rank = char => /[a-z]/i.test(char) ? 0 : /\d/.test(char) ? 1 : 2
    return Object.keys(font.value.glyphs).filter(char => !/[\u{1F629}\u{1F633}]/u.test(char)).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b)).join(" ")
  })

  const variantBadges = computed(() => {
    const badges = {}
    for (const item of library.fonts) {
      if (item.variant) badges[item.variant] = (badges[item.variant] ?? 1) + 1
    }
    return badges
  })
</script>

<template>
  <Panel title="All fonts" :modified="modified" @reset="reset">
    <template #actions>
      <button class="icon-button small" :class="{ active: info }" @click.stop="info = !info" title="Font info and characters"><Icon name="info" :size="17" /></button>
    </template>
    <div class="info" v-if="info && font">
      <p class="hint" v-if="font.description">{{ font.description }}</p>
      <div class="code">{{ characters }}</div>
      <p class="hint">An uppercase <code>A</code> gives the <code>a</code> with the creeper face.</p>
    </div>
    <div class="grid">
      <Tile v-for="data of baseFonts" :key="data.id" keyboard :label="data.name" :image="fontThumbnail(library.fonts, data.id)" :author="data.author" :badge="variantBadges[data.id]" :selected="baseId === data.id" @pick="object.font = data.id" />
    </div>
    <template v-if="variants.length">
      <h3>Variants</h3>
      <div class="grid">
        <Tile keyboard label="Default" :image="fontThumbnail(library.fonts, baseId)" :selected="object.font === baseId" @pick="object.font = baseId" />
        <Tile v-for="data of variants" :key="data.id" keyboard :label="data.name" :image="fontThumbnail(library.fonts, data.id)" :author="data.author" :selected="object.font === data.id" @pick="object.font = data.id" />
      </div>
    </template>
  </Panel>
  <Panel v-if="hasTerminators" title="Terminators" :modified="terminators.modified.value" @reset="terminators.reset">
    <Toggle label="Line terminators" hint="Adds the end pieces either side of the text" v-model="object.terminators" />
  </Panel>
</template>

<style scoped>
  .info {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 14px;
    background: var(--card);
  }

  .code {
    padding: 10px;
    font-family: var(--mono);
    font-size: var(--font-md);
    line-height: 1.7;
    word-break: break-all;
    color: var(--text);
    background: var(--field);
  }
</style>
