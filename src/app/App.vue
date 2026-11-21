<script setup>
  import { computed, onMounted, ref, watch } from "vue"
  import EditorDrawer from "./EditorDrawer.vue"
  import EulaDialog from "./EulaDialog.vue"
  import ContextMenu from "../components/ContextMenu.vue"
  import Notice from "../components/Notice.vue"
  import { canCopySection, canPasteSection, copySection, pasteSection } from "./panels/sectionClipboard.js"
  import LayerActions from "./LayerActions.vue"
  import LayerList from "./LayerList.vue"
  import MenuBar from "./MenuBar.vue"
  import NavTabs from "../components/NavTabs.vue"
  import PresetsPage from "./presets/PresetsPage.vue"
  import ObjectRenderer from "../render/ObjectRenderer.js"
  import RenderFrame from "./RenderFrame.vue"
  import ShareButton from "./ShareButton.vue"
  import TopBar from "../site/TopBar.vue"
  import Viewport from "./Viewport.vue"
  import ModelRenderer from "../render/ModelRenderer.js"
  import { loadTileables } from "../lib/texture/assets.js"
  import { eula } from "../lib/minecraft/eula.js"
  import { useWindowEvents } from "../components/composables/events.js"
  import { saveTitle } from "../lib/state/titleFile.js"
  import { loadFontList } from "../lib/font/font.js"
  import { isMinecraftShape, isModelShape, loadShapeList } from "../lib/geometry/shapes.js"
  import { titleItems } from "../lib/state/items.js"
  import { redo, undo } from "../lib/state/history.js"
  import { shortcutFor } from "./shortcuts.js"
  import { keepMatched } from "../lib/state/match.js"
  import { fileError, notice } from "../lib/state/notices.js"
  import { presetsPage } from "../lib/state/presetsPage.js"
  import { active, currentWord, library, saveError, scene, selection, shapingWord, words } from "../lib/state/scene.js"
  import { openSharedLink } from "../lib/link/share.js"
  import { openSubmissionLink } from "../submissions/submissionLink.js"
  import { loadStats } from "../lib/state/stats.js"
  import { SECTIONS, FORM_SECTIONS, view } from "../lib/state/view.js"

  const SECTION_TABS = Object.entries(SECTIONS).map(([id, { name, icon }]) => ({ id, label: name, icon }))
  const TEXT_SECTIONS = new Set(["text", "font"])
  const GAME_TEXTURED = new Set(["texture", "overlays"])
  const LINE_SECTIONS = new Set(["text", "font", "placement"])
  const SHAPE_SECTIONS = new Set(["shape", "placement"])

  if (!SECTIONS[view.section]) view.section = "text"

  keepMatched()

  const error = ref(null)
  const ready = ref(false)

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

  const sectionMenu = ref(null)

  function openSectionMenu(section, event) {
    if (!canCopySection(section)) return
    event.preventDefault()
    const name = SECTIONS[section].name.toLowerCase()
    const items = [{ label: `Copy ${name} settings`, icon: "copy", action: () => copySection(section) }]
    if (canPasteSection(section)) items.push({ label: `Paste ${name} settings`, icon: "paste", action: () => pasteSection(section) })
    sectionMenu.value = { at: { x: event.clientX, y: event.clientY }, items }
  }

  const SHORTCUTS = { undo, redo, save: saveTitle, open: () => menuBar.value.openPicker() }

  function shortcut(event) {
    const action = !presetsPage.open && shortcutFor(event)
    if (!action) return
    SHORTCUTS[action]()
    event.preventDefault()
  }

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

    <NavTabs v-if="editing" class="tabs" v-model="view.section" :tabs="tabs" icons @menu="openSectionMenu" />
    <ContextMenu :items="sectionMenu?.items" :at="sectionMenu?.at" @close="sectionMenu = null" />

    <EditorDrawer :editing="editing" :shape-line="shapeLine" />

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

    .tabs.nav-tabs :deep(.tab-bar:not(.tab-bar-ready) > .tab-bar-button:has(> .current)) {
      box-shadow: inset 0 2px 0 var(--accent);
    }
  }
</style>
