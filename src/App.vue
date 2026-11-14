<script setup>
  import { computed, onMounted, ref, watch } from "vue"
  import Button from "./components/Button.vue"
  import FluidTabs from "fluid-tabs-vue"
  import AccountMenu from "./components/AccountMenu.vue"
  import EulaDialog from "./components/EulaDialog.vue"
  import Notice from "./components/Notice.vue"
  import NotificationBell from "./components/NotificationBell.vue"
  import Icon from "./components/Icon.vue"
  import LayerActions from "./components/LayerActions.vue"
  import Panel from "./components/Panel.vue"
  import LayerList from "./components/LayerList.vue"
  import MenuBar from "./components/MenuBar.vue"
  import PresetsPage from "./components/PresetsPage.vue"
  import ObjectRenderer from "./components/ObjectRenderer.js"
  import RenderFrame from "./components/RenderFrame.vue"
  import Segments from "./components/Segments.vue"
  import ShareButton from "./components/ShareButton.vue"
  import Viewport from "./components/Viewport.vue"
  import ArcPanel from "./components/panels/ArcPanel.vue"
  import TwistPanel from "./components/panels/TwistPanel.vue"
  import ColourPanel from "./components/panels/ColourPanel.vue"
  import LayerPanel from "./components/panels/LayerPanel.vue"
  import FontPanel from "./components/panels/FontPanel.vue"
  import GeometryPanel from "./components/panels/GeometryPanel.vue"
  import OverlaysPanel from "./components/panels/OverlaysPanel.vue"
  import PlacementPanel from "./components/panels/PlacementPanel.vue"
  import RenderPanel from "./components/panels/RenderPanel.vue"
  import SpacingPanel from "./components/panels/SpacingPanel.vue"
  import TextPanel from "./components/panels/TextPanel.vue"
  import TexturePanel from "./components/panels/TexturePanel.vue"
  import ShapePanel from "./components/panels/ShapePanel.vue"
  import ModelRenderer from "./components/ModelRenderer.js"
  import TransformPanel from "./components/panels/TransformPanel.vue"
  import { loadTileables } from "./lib/assets.js"
  import { eula } from "./lib/eula.js"
  import { useWindowEvents } from "./lib/events.js"
  import { fileError, saveTitle } from "./lib/file.js"
  import { loadFontList } from "./lib/font.js"
  import { isMinecraftShape, isModelShape, loadShapeList } from "./lib/shapes.js"
  import { titleItems } from "./lib/items.js"
  import { redo, undo } from "./lib/history.js"
  import { keepMatched } from "./lib/match.js"
  import { notice } from "./lib/notices.js"
  import { presetsPage } from "./lib/presetsPage.js"
  import { active, addObject, addShape, currentWord, library, saveError, scene, selection, shapingWord, wordTabs, words } from "./lib/scene.js"
  import { openSharedLink } from "./lib/share.js"
  import { openSubmissionLink } from "./lib/submissionLink.js"
  import { loadStats } from "./lib/stats.js"
  import { SECTIONS, FORM_SECTIONS, view } from "./lib/view.js"

  const SECTION_TABS = Object.entries(SECTIONS).map(([id, { name, icon }]) => ({ id, label: name, icon }))
  const TEXT_SECTIONS = new Set(["text", "font"])
  const GAME_TEXTURED = new Set(["texture", "overlays"])
  const SHAPE_TABS = [{ value: "line", label: "Whole line" }, { value: "word", label: "Current word" }]
  const LINE_SECTIONS = new Set(["text", "font", "placement"])
  const SHAPE_SECTIONS = new Set(["shape", "placement"])

  if (!SECTIONS[view.section]) view.section = "text"

  keepMatched()

  const error = ref(null)
  const ready = ref(false)
  const drawer = ref(null)

  const menuBar = ref(null)

  const selected = computed(() => {
    if (view.render || !currentWord.value) return []
    if (FORM_SECTIONS.has(view.section)) return (shapingWord.value ? [currentWord.value] : words(currentWord.value)).map(object => object.id)
    if (LINE_SECTIONS.has(view.section)) return words(currentWord.value).map(object => object.id)
    return selection.value.map(object => object.id)
  })
  const status = computed(() => error.value ?? fileError.value ?? saveError.value ?? active.value.error)
  const editing = computed(() => !view.render && scene.objects.length > 0)
  const shapeLine = computed(() => currentWord.value?.shape != null)
  const minecraftLine = computed(() => isMinecraftShape(currentWord.value?.shape))
  const tabs = computed(() => SECTION_TABS.filter(tab => shapeLine.value ? !TEXT_SECTIONS.has(tab.id) && !(minecraftLine.value && GAME_TEXTURED.has(tab.id)) : !SHAPE_SECTIONS.has(tab.id)))

  watch(shapeLine, value => {
    if (value && TEXT_SECTIONS.has(view.section)) view.section = "shape"
    else if (!value && SHAPE_SECTIONS.has(view.section)) view.section = "text"
  }, { immediate: true })

  watch(minecraftLine, value => {
    if (value && GAME_TEXTURED.has(view.section)) view.section = "shape"
  }, { immediate: true })

  function shortcut(event) {
    if (!(event.ctrlKey || event.metaKey) || event.altKey || presetsPage.open) return
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

  useWindowEvents(() => true, { keydown: shortcut })

  onMounted(async () => {
    loadStats().catch(console.error)
    try {
      const [fonts, shapes, tileables] = await Promise.all([loadFontList(), loadShapeList(), loadTileables(), openSharedLink(), openSubmissionLink()])
      library.fonts = fonts
      library.shapes = shapes
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
      <h1><a class="brand" href="/" aria-label="Minecraft Title Generator"><img src="/favicon.svg" alt="" width="24" height="24"><span class="ellipsis">Minecraft Title Generator</span></a></h1>
      <MenuBar ref="menuBar" />
      <ShareButton />
      <AccountMenu />
      <NotificationBell />
    </header>

    <LayerList />

    <LayerActions v-if="editing" />

    <FluidTabs v-if="editing" class="tabs" v-model="view.section" :tabs="tabs" tab-style="nav">
      <template #label="{ tab }">
        <Icon :name="tab.icon" :size="20" />
        <span>{{ tab.label }}</span>
      </template>
    </FluidTabs>

    <aside ref="drawer" class="drawer">
      <div v-if="!editing" class="intro row">
        <h2>{{ view.render ? "Render" : "No text" }}</h2>
      </div>
      <RenderPanel v-if="view.render" />
      <Panel v-else-if="!editing">
        <Button primary wide @click="addObject"><template #icon><Icon name="letter" :size="16" /></template>
          <span>Add text</span>
        </Button>
        <Button wide @click="addShape"><template #icon><Icon name="star" :size="16" /></template>
          <span>Add shape</span>
        </Button>
      </Panel>
      <template v-else-if="view.section === 'text'">
        <TextPanel />
        <PlacementPanel />
      </template>
      <template v-else-if="view.section === 'font'">
        <FontPanel />
        <SpacingPanel />
      </template>
      <ShapePanel v-else-if="view.section === 'shape'" :key="currentWord.id" />
      <PlacementPanel v-else-if="view.section === 'placement'" />
      <template v-else-if="view.section === 'texture'">
        <LayerPanel group="texture" />
        <TexturePanel />
      </template>
      <template v-else-if="view.section === 'colour'">
        <LayerPanel group="colour" />
        <ColourPanel />
      </template>
      <template v-else-if="view.section === 'overlays'">
        <LayerPanel group="overlays" />
        <OverlaysPanel />
        <OverlaysPanel v-if="!active.font?.model" edge />
      </template>
      <template v-else-if="FORM_SECTIONS.has(view.section)">
        <Panel v-if="wordTabs && !shapeLine">
          <Segments :options="SHAPE_TABS" v-model="view.shapeTab" />
          <p v-if="shapingWord" class="hint">Only changes "{{ currentWord.text.trim() }}", on top of the shape of the whole line.</p>
        </Panel>
        <template v-if="view.section === 'form'">
          <GeometryPanel :word="shapingWord" :key="shapingWord ? 'word-geometry' : 'line-geometry'" />
          <template v-if="!shapeLine">
            <ArcPanel :word="shapingWord" :key="shapingWord ? 'word-arc' : 'line-arc'" />
            <TwistPanel v-if="!shapingWord" />
          </template>
        </template>
        <TransformPanel v-else :word="shapingWord" />
      </template>
      <p class="disclaimer"><span>Not an official Minecraft product.</span> <span>Not approved by or associated with Mojang or Microsoft.</span></p>
    </aside>

    <main class="stage">
      <Viewport :items="titleItems" :selected="selected" />
      <RenderFrame v-if="view.render" />
      <Notice v-if="status" class="status">{{ status }}</Notice>
      <p v-if="notice" class="toast" role="status">{{ notice }}</p>
    </main>

    <PresetsPage v-if="presetsPage.open" />
    <EulaDialog v-if="eula.asking" />

    <template v-if="ready">
      <template v-for="object of scene.objects" :key="object.id">
        <ModelRenderer v-if="isModelShape(library.shapes, object.shape)" :object="object" :shapes="library.shapes" />
        <ObjectRenderer v-else :object="object" :fonts="library.fonts" :shapes="library.shapes" :tileables="library.tileables" />
      </template>
    </template>
  </div>
</template>

<style scoped>
  .app {
    display: grid;
    grid-template-columns: 77px 464px minmax(0, 1fr);
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

  .account {
    margin-left: 10px;
  }

  .notification-bell {
    margin-left: 6px;
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
    font-family: var(--font-ui);
    color: var(--text);
    text-decoration: none;
    user-select: none;
  }

  .brand img {
    flex: none;
  }

  .tabs {
    grid-area: tabs;
    padding: 0 8px;
    background: var(--surface);
    border-right: 1px solid var(--line);
    border-bottom: 1px solid var(--line);
  }

  .tabs :deep(.tab-bar) {
    box-shadow: none;
  }

  .tabs :deep(.tab-bar-button) {
    gap: 4px;
    min-width: 0;
    padding: 10px 0 9px;
    font-size: var(--font-xs);
    font-weight: 600;
    color: var(--faint);
  }

  .tabs :deep(.tab-bar-button:hover) {
    color: var(--text);
  }

  .tabs :deep(.tab-bar-button.active) {
    color: var(--accent);
  }

  .tabs :deep(.tab-bar-button svg) {
    width: 20px;
    height: 20px;
  }

  .tabs :deep(.tab-bar-active) {
    bottom: 0;
    border-top: none;
    border-bottom: 2px solid var(--accent);
  }

  .drawer {
    --group-padding: 20px;
    --disclaimer-height: 67px;
    grid-area: drawer;
    display: flex;
    flex-direction: column;
    min-height: 0;
    container-type: size;
    overflow-y: auto;
    background: var(--surface);
    border-right: 1px solid var(--line);
  }

  .drawer > * {
    flex: none;
  }

  .disclaimer {
    min-height: var(--disclaimer-height);
    margin: auto 0 0;
    padding: 16px var(--group-padding);
    font-size: var(--font-sm);
    line-height: 17px;
    color: var(--faint);
    border-top: 1px solid var(--line);
  }

  .disclaimer span {
    display: block;
    text-wrap: balance;
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

  .status {
    position: absolute;
    left: 12px;
    right: 12px;
    top: 12px;
    z-index: 3;
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

    .tabs :deep(.tab-bar-button) {
      padding: 9px 0 8px;
      font-size: var(--font-xxs);
    }

    .tabs :deep(.tab-bar-active) {
      top: 0;
      bottom: auto;
      border-top: 2px solid var(--accent);
      border-bottom: none;
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
