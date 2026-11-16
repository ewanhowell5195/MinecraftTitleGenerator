<script setup>
  import { computed, onMounted, ref, watch } from "vue"
  import Button from "../components/Button.vue"
  import EulaDialog from "./EulaDialog.vue"
  import Notice from "../components/Notice.vue"
  import Icon from "../components/Icon.vue"
  import LayerActions from "./LayerActions.vue"
  import Panel from "./Panel.vue"
  import LayerList from "./LayerList.vue"
  import MenuBar from "./MenuBar.vue"
  import NavTabs from "../components/NavTabs.vue"
  import PresetsPage from "./presets/PresetsPage.vue"
  import ObjectRenderer from "../render/ObjectRenderer.js"
  import RenderFrame from "./RenderFrame.vue"
  import Segments from "../components/Segments.vue"
  import ShareButton from "./ShareButton.vue"
  import TopBar from "../site/TopBar.vue"
  import Viewport from "./Viewport.vue"
  import ArcPanel from "./panels/ArcPanel.vue"
  import TwistPanel from "./panels/TwistPanel.vue"
  import CameraPanel from "./panels/CameraPanel.vue"
  import ColourPanel from "./panels/ColourPanel.vue"
  import LayerPanel from "./panels/LayerPanel.vue"
  import FontPanel from "./panels/FontPanel.vue"
  import GeometryPanel from "./panels/GeometryPanel.vue"
  import OverlaysPanel from "./panels/OverlaysPanel.vue"
  import PlacementPanel from "./panels/PlacementPanel.vue"
  import RenderPanel from "./panels/RenderPanel.vue"
  import SpacingPanel from "./panels/SpacingPanel.vue"
  import TextPanel from "./panels/TextPanel.vue"
  import TexturePanel from "./panels/TexturePanel.vue"
  import ShapePanel from "./panels/ShapePanel.vue"
  import ModelRenderer from "../render/ModelRenderer.js"
  import TransformPanel from "./panels/TransformPanel.vue"
  import { loadTileables } from "../lib/texture/assets.js"
  import { eula } from "../lib/minecraft/eula.js"
  import { useWindowEvents } from "../components/composables/events.js"
  import { saveTitle } from "../lib/state/titleFile.js"
  import { loadFontList } from "../lib/font/font.js"
  import { isMinecraftShape, isModelShape, loadShapeList } from "../lib/geometry/shapes.js"
  import { titleItems } from "../lib/state/items.js"
  import { redo, undo } from "../lib/state/history.js"
  import { keepMatched } from "../lib/state/match.js"
  import { fileError, notice } from "../lib/state/notices.js"
  import { presetsPage } from "../lib/state/presetsPage.js"
  import { active, addObject, addShape, currentWord, library, saveError, scene, selection, shapingWord, wordTabs, words } from "../lib/state/scene.js"
  import { openSharedLink } from "../lib/link/share.js"
  import { openSubmissionLink } from "../submissions/submissionLink.js"
  import { loadStats } from "../lib/state/stats.js"
  import { SECTIONS, FORM_SECTIONS, view } from "../lib/state/view.js"

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
    if (view.render || view.camera || !currentWord.value) return []
    if (FORM_SECTIONS.has(view.section)) return (shapingWord.value ? [currentWord.value] : words(currentWord.value)).map(object => object.id)
    if (LINE_SECTIONS.has(view.section)) return words(currentWord.value).map(object => object.id)
    return selection.value.map(object => object.id)
  })
  const status = computed(() => error.value ?? fileError.value ?? saveError.value ?? active.value.error)
  const editing = computed(() => !view.render && !view.camera && scene.objects.length > 0)
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

  watch(() => [view.section, view.render, view.camera], () => {
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
    <TopBar class="bar" heading>
      <MenuBar ref="menuBar" />
      <template #end><ShareButton /></template>
    </TopBar>

    <LayerList />

    <LayerActions v-if="editing" />

    <NavTabs v-if="editing" class="tabs" v-model="view.section" :tabs="tabs" icons />

    <aside ref="drawer" class="drawer">
      <div v-if="!editing" class="intro row">
        <h2>{{ view.render ? "Render" : view.camera ? "Camera" : "No text" }}</h2>
      </div>
      <RenderPanel v-if="view.render" />
      <CameraPanel v-else-if="view.camera" />
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
  }

  .tabs {
    grid-area: tabs;
    padding: 0 8px;
    background: var(--surface);
    border-right: 1px solid var(--line);
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

    .tabs.nav-tabs {
      padding: 0 6px env(safe-area-inset-bottom);
      border-right: none;
      border-bottom: none;
      border-top: 1px solid var(--line);
    }

    .tabs.nav-tabs :deep(.tab-bar-button) {
      padding: 9px 0 8px;
      font-size: var(--font-xxs);
    }

    .tabs.nav-tabs :deep(.tab-bar-active) {
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
</style>
