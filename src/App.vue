<script setup>
  import { computed, onMounted, ref, watch } from "vue"
  import Icon from "./components/Icon.vue"
  import LayerActions from "./components/LayerActions.vue"
  import Panel from "./components/Panel.vue"
  import LayerList from "./components/LayerList.vue"
  import MenuBar from "./components/MenuBar.vue"
  import ObjectRenderer from "./components/ObjectRenderer.js"
  import RenderFrame from "./components/RenderFrame.vue"
  import Segments from "./components/Segments.vue"
  import ShareButton from "./components/ShareButton.vue"
  import Viewport from "./components/Viewport.vue"
  import ArcPanel from "./components/panels/ArcPanel.vue"
  import ColourPanel from "./components/panels/ColourPanel.vue"
  import FacesPanel from "./components/panels/FacesPanel.vue"
  import FontPanel from "./components/panels/FontPanel.vue"
  import GeometryPanel from "./components/panels/GeometryPanel.vue"
  import OverlaysPanel from "./components/panels/OverlaysPanel.vue"
  import PlacementPanel from "./components/panels/PlacementPanel.vue"
  import RenderPanel from "./components/panels/RenderPanel.vue"
  import SpacingPanel from "./components/panels/SpacingPanel.vue"
  import TextPanel from "./components/panels/TextPanel.vue"
  import TexturePanel from "./components/panels/TexturePanel.vue"
  import TransformPanel from "./components/panels/TransformPanel.vue"
  import { loadTileables } from "./lib/assets.js"
  import { useWindowEvents } from "./lib/events.js"
  import { fileError, saveTitle } from "./lib/file.js"
  import { loadFontList } from "./lib/font.js"
  import { titleItems } from "./lib/items.js"
  import { redo, undo } from "./lib/history.js"
  import { keepMatched } from "./lib/match.js"
  import { active, addObject, currentWord, library, runtime, saveError, scene, selection, shapingWord, wordTabs, words } from "./lib/scene.js"
  import { openSharedLink } from "./lib/share.js"
  import { loadStats } from "./lib/stats.js"
  import { SECTIONS, view } from "./lib/view.js"

  const SHAPE_TABS = [{ value: "line", label: "Whole line" }, { value: "word", label: "Current word" }]
  const LINE_SECTIONS = new Set(["text", "font"])

  if (!SECTIONS[view.section]) view.section = "text"

  keepMatched()

  const error = ref(null)
  const ready = ref(false)
  const drawer = ref(null)

  const menuBar = ref(null)

  const selected = computed(() => {
    if (view.render) return []
    if (view.section === "shape") return (shapingWord.value ? [currentWord.value] : words(currentWord.value)).map(object => object.id)
    if (LINE_SECTIONS.has(view.section)) return words(currentWord.value).map(object => object.id)
    return selection.value.map(object => object.id)
  })
  const status = computed(() => error.value ?? fileError.value ?? saveError.value ?? active.value.error)
  const editing = computed(() => !view.render && scene.objects.length > 0)

  function shortcut(event) {
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return
    if (event.target.matches("input[type=text], textarea")) return
    const key = event.key.toLowerCase()
    if (key === "z" && !event.shiftKey) undo()
    else if (key === "y" || key === "z" && event.shiftKey) redo()
    else if (key === "s") saveTitle()
    else if (key === "o") menuBar.value.openPicker()
    else return
    event.preventDefault()
  }

  watch(() => [view.section, view.render], () => {
    drawer.value.scrollTop = 0
  })

  useWindowEvents(() => true, { keydown: shortcut, hashchange: openSharedLink })

  onMounted(async () => {
    loadStats().catch(console.error)
    try {
      const [fonts, tileables] = await Promise.all([loadFontList(), loadTileables(), openSharedLink()])
      library.fonts = fonts
      library.tileables = tileables
      ready.value = true
    } catch (err) {
      error.value = err.message
    }
  })
</script>

<template>
  <div class="app" :class="{ wide: !editing }">
    <header class="bar">
      <h1><a class="brand" href="/" aria-label="Minecraft Title Generator"><img src="/favicon.svg" alt="" width="24" height="24"><span>Minecraft Title Generator</span></a></h1>
      <MenuBar ref="menuBar" />
      <ShareButton />
    </header>

    <LayerList />

    <LayerActions v-if="editing" />

    <nav class="tabs" v-if="editing">
      <button v-for="(data, id) of SECTIONS" :key="id" class="tab" :class="{ selected: view.section === id }" @click="view.section = id">
        <Icon :name="data.icon" :size="20" />
        <span>{{ data.name }}</span>
      </button>
    </nav>

    <aside ref="drawer" class="drawer">
      <div v-if="!editing" class="intro row">
        <h2>{{ view.render ? "Render" : "No text" }}</h2>
      </div>
      <RenderPanel v-if="view.render" />
      <Panel v-else-if="!editing">
        <button class="primary wide" @click="addObject">
          <Icon name="plus" :size="16" />
          <span>Add text</span>
        </button>
      </Panel>
      <template v-else-if="view.section === 'text'">
        <TextPanel />
        <PlacementPanel />
      </template>
      <template v-else-if="view.section === 'font'">
        <FontPanel />
        <SpacingPanel />
      </template>
      <template v-else-if="view.section === 'shape'">
        <Panel v-if="wordTabs">
          <Segments :options="SHAPE_TABS" v-model="view.shapeTab" />
          <p v-if="shapingWord" class="hint">Only changes "{{ currentWord.text.trim() }}", on top of the shape of the whole line.</p>
        </Panel>
        <GeometryPanel :word="shapingWord" :key="shapingWord ? 'word-geometry' : 'line-geometry'" />
        <ArcPanel :word="shapingWord" :key="shapingWord ? 'word-arc' : 'line-arc'" />
        <TransformPanel :word="shapingWord" />
      </template>
      <TexturePanel v-else-if="view.section === 'texture'" />
      <ColourPanel v-else-if="view.section === 'colour'" />
      <FacesPanel v-else-if="view.section === 'faces'" />
      <template v-else-if="view.section === 'overlays'">
        <OverlaysPanel />
        <OverlaysPanel edge />
      </template>
    </aside>

    <main class="stage">
      <Viewport :items="titleItems" :selected="selected" />
      <RenderFrame v-if="view.render" />
      <p v-if="status" class="error">{{ status }}</p>
    </main>

    <template v-if="ready">
      <ObjectRenderer v-for="object of scene.objects" :key="object.id" :object="object" :fonts="library.fonts" :tileables="library.tileables" />
    </template>
  </div>
</template>

<style scoped>
  .app {
    display: grid;
    grid-template-columns: 76px 464px minmax(0, 1fr);
    grid-template-rows: 60px auto auto minmax(0, 1fr);
    grid-template-areas: "bar bar bar" "layers actions stage" "layers tabs stage" "layers drawer stage";
    height: 100vh;
    height: 100dvh;
  }

  .app.wide {
    grid-template-areas: "bar bar bar" "layers drawer stage" "layers drawer stage" "layers drawer stage";
  }

  .bar {
    grid-area: bar;
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 0 14px 0 18px;
    background: var(--surface);
    border-bottom: 1px solid var(--line);
  }

  h1 {
    min-width: 0;
    margin: 0;
    font-size: var(--font-lg);
    font-weight: 600;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
    color: var(--text);
    text-decoration: none;
    user-select: none;
  }

  .brand img {
    flex: none;
  }

  .brand span {
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .tabs {
    grid-area: tabs;
    display: flex;
    padding: 0 8px;
    background: var(--surface);
    border-right: 1px solid var(--line);
    border-bottom: 1px solid var(--line);
  }

  .tab {
    flex: 1 1 0;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
    padding: 10px 0 9px;
    font-size: var(--font-xs);
    color: var(--faint);
    background: transparent;
    border: none;
    box-shadow: inset 0 -2px transparent;
  }

  .tab:hover {
    color: var(--text);
    background: transparent;
  }

  .tab.selected {
    color: var(--accent);
    box-shadow: inset 0 -2px var(--accent);
  }

  .drawer {
    --group-padding: 20px;
    grid-area: drawer;
    min-height: 0;
    container-type: size;
    overflow-y: auto;
    background: var(--surface);
    border-right: 1px solid var(--line);
  }

  .intro {
    height: 50px;
    padding: 18px 20px 0;
  }

  .intro + :deep(.group),
  .drawer > :deep(.group:first-child) {
    border-top: none;
  }

  .stage {
    position: relative;
    grid-area: stage;
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }

  .error {
    position: absolute;
    left: 16px;
    right: 16px;
    top: 16px;
    z-index: 3;
    margin: 0;
    padding: 10px 14px;
    font-size: var(--font-md);
    color: var(--danger);
    background: #2c1513;
    border: 1px solid #5e2a25;
  }

  @media (max-width: 800px) {
    .app,
    .app.wide {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: 54px minmax(170px, 30dvh) auto auto minmax(0, 1fr) auto;
      grid-template-areas: "bar" "stage" "layers" "actions" "drawer" "tabs";
    }

    .bar {
      padding: 0 8px 0 12px;
    }

    h1 {
      font-size: var(--font-base);
    }

    .tabs {
      padding: 0 6px env(safe-area-inset-bottom);
      border-right: none;
      border-bottom: none;
      border-top: 1px solid var(--line);
    }

    .tab {
      padding: 9px 0 8px;
      font-size: var(--font-xxs);
      box-shadow: inset 0 2px transparent;
    }

    .tab.selected {
      box-shadow: inset 0 2px var(--accent);
    }

    .drawer {
      --group-padding: 16px;
      border-right: none;
      border-top: 1px solid var(--line);
    }

    .intro {
      height: 46px;
      padding: 14px 16px 0;
    }

    .intro h2 {
      font-size: 17px;
    }
  }

  @media (max-width: 600px) {
    .brand span {
      display: none;
    }
  }
</style>
