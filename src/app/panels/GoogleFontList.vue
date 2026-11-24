<script setup>
  import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue"
  import { openedFirst } from "../../lib/panels/opened.js"
  import { byUsage } from "../../lib/title/popularity.js"
  import { googleStatId } from "../../lib/title/statIds.js"
  import { googleFontList, googlePreview, googlePreviewFamily, styleLabel, styleParts } from "../../lib/font/googleFonts.js"
  import Dropdown from "../../components/Dropdown.vue"
  import Slider from "../../components/Slider.vue"
  import Toggle from "../../components/Toggle.vue"
  import Notice from "../../components/Notice.vue"
  import Tile from "../../components/Tile.vue"
  import TileGrid from "../../components/TileGrid.vue"

  const PAGE = 60

  const props = defineProps({
    search: { type: String, default: "" },
    current: { type: Object, default: null },
    opened: { type: String, default: null },
    loading: { type: String, default: null }
  })

  const emit = defineEmits(["pick"])

  const fonts = ref([])
  const error = ref("")
  const limit = ref(PAGE)
  const more = ref(null)
  const loaded = reactive({})
  const found = computed(() => {
    const term = props.search.trim().toLowerCase()
    const ordered = openedFirst(byUsage(fonts.value, font => googleStatId(font.family)), font => font.family === props.opened)
    if (!term) return ordered
    return ordered.filter(font => [font.family, font.category].concat(font.designers).some(text => text.toLowerCase().includes(term)))
  })
  const shown = computed(() => found.value.slice(0, limit.value))
  const byFamily = computed(() => new Map(fonts.value.map(font => [font.family, font])))
  const entry = computed(() => byFamily.value.get(props.current?.google))
  const styles = computed(() => (entry.value?.styles ?? []).map(style => ({ value: style, label: styleLabel(style) })))
  const italic = computed(() => !!props.current && styleParts(props.current.style).italic)
  const bothSlants = computed(() => ["", "i"].every(end => entry.value?.styles.some(style => style.endsWith("i") === !!end)))
  const weight = ref(400)

  watch(() => props.current?.style, style => {
    if (style) weight.value = styleParts(style).weight
  }, { immediate: true })

  function restyle(nextWeight, nextItalic) {
    const style = `${nextWeight}${nextItalic ? "i" : ""}`
    if (style !== props.current.style) emit("pick", { family: props.current.google, style })
  }

  function pick(font) {
    if (!props.loading && font.family !== props.current?.google) emit("pick", { family: font.family, style: font.style })
  }

  const samples = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue
      samples.unobserve(entry.target)
      const font = byFamily.value.get(entry.target.dataset.family)
      googlePreview(font).then(() => (loaded[font.family] = true), () => {})
    }
  })

  const paging = new IntersectionObserver(entries => {
    if (entries.some(entry => entry.isIntersecting)) limit.value += PAGE
  })

  function observe(element) {
    if (element && !loaded[element.dataset.family]) samples.observe(element)
  }

  watch(() => props.search, () => (limit.value = PAGE))

  watch(more, (element, before) => {
    if (before) paging.unobserve(before)
    if (element) paging.observe(element)
  })

  onMounted(async () => {
    try {
      fonts.value = await googleFontList()
    } catch (err) {
      error.value = `Couldn't load Google Fonts: ${err.message}`
    }
  })

  onBeforeUnmount(() => {
    samples.disconnect()
    paging.disconnect()
  })
</script>

<template>
  <Notice v-if="error">{{ error }}</Notice>
  <p v-else-if="!fonts.length" class="hint">Loading fonts...</p>
  <p v-else-if="!found.length" class="hint">No fonts match</p>
  <TileGrid v-else class="scroll">
    <Tile v-for="font of shown" :key="font.family" :label="font.family === loading ? 'Loading...' : font.family" :author="font.designers" :selected="font.family === current?.google" :faded="!!loading && font.family !== loading" @pick="pick(font)">
      <template #picture>
        <span :ref="observe" class="sample" :data-family="font.family"><span :class="{ shown: loaded[font.family] }" :style="{ fontFamily: googlePreviewFamily(font.family) }">ABC</span></span>
      </template>
    </Tile>
    <div v-if="shown.length < found.length" ref="more" class="more"></div>
  </TileGrid>
  <template v-if="entry?.weights">
    <Slider label="Weight" v-model="weight" :min="entry.weights[0]" :max="entry.weights[1]" @change="restyle(weight, italic)" />
    <Toggle v-if="bothSlants" label="Italic" :model-value="italic" @update:model-value="restyle(weight, $event)" />
  </template>
  <Dropdown v-else-if="styles.length > 1" label="Style" :options="styles" :model-value="current.style" @update:model-value="emit('pick', { family: current.google, style: $event })" />
</template>

<style scoped>
  .sample {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    container-type: size;
    overflow: hidden;
  }

  .sample > span {
    font-size: min(56cqh, 26cqw);
    line-height: 1;
    white-space: nowrap;
    color: #ffffff;
    -webkit-text-stroke: 0.1em #000000;
    paint-order: stroke fill;
    opacity: 0;
    transition: opacity var(--duration);
  }

  .sample > .shown {
    opacity: 1;
  }

  .more {
    grid-column: 1 / -1;
    height: 1px;
  }
</style>
