<script setup>
  import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue"
  import { useRoute } from "vue-router"
  import { navigate } from "../lib/state/navigation.js"
  import Button from "../components/Button.vue"
  import Notice from "../components/Notice.vue"
  import NavTabs from "../components/NavTabs.vue"
  import Icon from "../components/Icon.vue"
  import MenuStrip from "../components/MenuStrip.vue"
  import Dialog from "../components/Dialog.vue"
  import Spinner from "../components/Spinner.vue"
  import SiteHeader from "../site/SiteHeader.vue"
  import TopBar from "../site/TopBar.vue"
  import CharacterList from "./CharacterList.vue"
  import CharacterPanel from "./CharacterPanel.vue"
  import FontSettingsPanel from "./FontSettingsPanel.vue"
  import GlyphCanvas from "./GlyphCanvas.vue"
  import KerningPanel from "./KerningPanel.vue"
  import PreviewPanel from "./PreviewPanel.vue"
  import TexturesPanel from "./TexturesPanel.vue"
  import ImportScreen from "./ImportScreen.vue"
  import ScrollPage from "./ScrollPage.vue"
  import StartScreen from "./StartScreen.vue"
  import { EDITOR_PATH, IMPORT_PATH, START_PATH, canRedo, canUndo, downloadFlatTexture, downloadJson, downloadStripTexture, downloadTexture, flushSave, font, importing, opened, pendingFont, redo, editingSubmission, replaceFont, restoreFont, saveError, saveSubmission, submitFont, takeSubmissionFont, typing, undo } from "./store.js"

  const TABS = [{ id: "font", label: "Font" }, { id: "characters", label: "Characters" }, { id: "textures", label: "Textures" }, { id: "kerning", label: "Kerning" }]

  const TAB_KEY = "minecraft-title-font-editor-tab"

  const tab = ref(savedTab())

  function savedTab() {
    const saved = localStorage.getItem(TAB_KEY)
    return TABS.some(item => item.id === saved) ? saved : "characters"
  }

  const VIEWS = { [EDITOR_PATH]: "editor", [IMPORT_PATH]: "import" }

  const route = useRoute()
  const loadError = ref("")
  const view = computed(() => VIEWS[route.path.replace(/\/$/, "")] ?? "start")

  const menus = computed(() => ({
    File: [
      { label: "New font", icon: "plus", action: () => navigate(START_PATH) },
      { label: "Save", icon: "download", action: downloadJson },
      { label: "Export", icon: "texture", items: [
        { label: "Font sheet (font.png)", icon: "download", action: downloadTexture },
        { label: "Flat texture (flat.png)", icon: "download", action: downloadFlatTexture },
        { label: "Strip texture (strip.png)", icon: "download", action: downloadStripTexture }
      ] }
    ],
    Edit: [
      { label: "Undo", icon: "undo", disabled: !canUndo.value, keepOpen: true, action: undo },
      { label: "Redo", icon: "redo", disabled: !canRedo.value, keepOpen: true, action: redo }
    ]
  }))

  watch(tab, value => localStorage.setItem(TAB_KEY, value))

  if (!font.value) {
    try {
      restoreFont()
    } catch (err) {
      loadError.value = `Your saved font couldn't be opened: ${err.message}`
    }
  }

  takeSubmissionFont().catch(err => loadError.value = `The submission's font couldn't be opened: ${err.message}`)

  function key(event) {
    const letter = event.key.toLowerCase()
    if (!font.value || view.value !== "editor" || !(event.ctrlKey || event.metaKey) || !["y", "z"].includes(letter) || typing(event.target)) return
    event.preventDefault()
    if (letter === "z" && !event.shiftKey) undo()
    else redo()
  }

  function cancelReplace() {
    pendingFont.value = null
  }

  watch(opened, () => tab.value = "characters")

  watch(() => [view.value, !!font.value, !!importing.value], ([current, hasFont, hasImport]) => {
    if (current === "editor" && !hasFont || current === "import" && !hasImport) navigate(START_PATH, { replace: true })
  }, { immediate: true })

  onMounted(() => {
    addEventListener("keydown", key)
    addEventListener("pagehide", flushSave)
  })

  onBeforeUnmount(() => {
    removeEventListener("keydown", key)
    removeEventListener("pagehide", flushSave)
    flushSave()
  })
</script>

<template>
  <div class="editor-page">
    <template v-if="view !== 'editor'">
      <SiteHeader />
      <div class="site-gap"></div>
    </template>
    <TopBar v-else class="top">
      <template v-if="font && view === 'editor'">
        <MenuStrip :menus="menus" />
        <NavTabs class="main-tabs divided" v-model="tab" :tabs="TABS" />
      </template>
      <template #end>
        <Button v-if="font && view === 'editor' && editingSubmission" primary class="update" v-tooltip="'Save your submission with this font as its file'" @click="saveSubmission"><template #icon><Icon name="upload" :size="16" /></template>Save submission</Button>
        <Button v-else-if="font && view === 'editor'" primary v-tooltip="'Send this font to be added to the title generator'" @click="submitFont"><template #icon><Icon name="upload" :size="16" /></template>Submit</Button>
      </template>
    </TopBar>

    <Notice v-if="loadError" class="top-notice">{{ loadError }}</Notice>
    <Notice v-if="saveError" class="top-notice">{{ saveError }}</Notice>

    <StartScreen v-if="view === 'start'" />

    <ScrollPage v-else-if="view === 'import'">
      <ImportScreen v-if="importing?.suggested" :key="importing.name" :picked="importing" />
      <div v-else-if="importing" class="import-waiting">
        <h1>Import {{ importing.name }}</h1>
        <Notice v-if="importing.error" class="error">{{ importing.error }}</Notice>
        <div v-else class="reading">
          <Spinner />
          <p class="hint">Reading the font...</p>
        </div>
      </div>
    </ScrollPage>

    <template v-else-if="!font"></template>

    <main v-else-if="tab === 'characters'" class="workspace">
      <CharacterList class="left" />
      <div class="centre">
        <GlyphCanvas />
        <PreviewPanel />
      </div>
      <aside class="right">
        <CharacterPanel />
      </aside>
    </main>

    <main v-else class="page">
      <div class="page-body">
        <FontSettingsPanel v-if="tab === 'font'" class="page-column" />
        <TexturesPanel v-else-if="tab === 'textures'" class="page-column wide" />
        <KerningPanel v-else class="page-column wide" />
      </div>
      <PreviewPanel v-if="tab !== 'textures'" />
    </main>

    <Dialog v-if="pendingFont && font" title="Replace your saved font?" close-title="Cancel" dismissable @close="cancelReplace">
      <div class="dialog-body">
        <p>This browser only remembers one font, so <strong>{{ font.name }}</strong> will be replaced. Download its JSON first if you want to keep it.</p>
        <div class="dialog-actions">
          <Button @click="downloadJson"><template #icon><Icon name="download" :size="14" /></template>Download JSON</Button>
          <div class="spacer"></div>
          <Button @click="cancelReplace">Cancel</Button>
          <Button danger @click="replaceFont">Replace it</Button>
        </div>
      </div>
    </Dialog>
  </div>
</template>

<style scoped>
  .update {
    white-space: nowrap;
  }

  .editor-page {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }

  .top {
    flex: none;
  }

  .top-notice {
    flex: none;
  }

  .site-gap {
    flex: none;
    height: 64px;
  }

  .import-waiting {
    max-width: 1100px;
    margin: 0 auto;
  }

  .import-waiting h1 {
    margin: 0 0 22px;
    font-size: 28px;
    overflow-wrap: anywhere;
  }

  .reading {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 64px 16px;
    background: var(--surface);
    border: 1px solid var(--line);
  }

  .workspace {
    flex: 1;
    display: grid;
    grid-template-columns: 268px minmax(0, 1fr) 320px;
    min-height: 0;
  }

  .left {
    min-height: 0;
    border-right: 1px solid var(--line);
  }

  .centre {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
  }

  .right {
    min-height: 0;
    overflow-y: auto;
    padding: 14px;
    background: var(--surface);
    border-left: 1px solid var(--line);
  }

  .main-tabs {
    flex: none;
    align-self: stretch;
    padding-left: var(--bar-item-padding);
  }

  .main-tabs.nav-tabs {
    border-bottom: 0;
  }

  .main-tabs :deep(.tab-bar) {
    height: 100%;
    margin: 0;
  }

  .main-tabs.nav-tabs :deep(.tab-bar-button) {
    padding: 0 2px;
  }

  .page {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .page-body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 20px 16px;
  }

  .page-column {
    max-width: 640px;
    margin: 0 auto;
  }

  .page-column.wide {
    max-width: 1280px;
  }

  @media (max-width: 1000px) {
    .editor-page {
      height: auto;
      min-height: 100%;
    }

    .top {
      position: sticky;
      top: 0;
      z-index: 10;
      flex-wrap: wrap;
      row-gap: 0;
    }

    .top :deep(.top-bar-brand) {
      min-height: var(--bar-height);
    }

    .main-tabs {
      order: 10;
      flex-basis: calc(100% + var(--bar-start) + var(--bar-end));
      height: 44px;
      margin: 0 calc(-1 * var(--bar-end)) 0 calc(-1 * var(--bar-start));
      padding-left: 0;
      border-top: 1px solid var(--line);
    }

    .main-tabs::before {
      display: none;
    }

    .main-tabs :deep(.tab-bar) {
      width: 100%;
    }

    .main-tabs.nav-tabs :deep(.tab-bar-button) {
      flex: 1;
      padding: 0 6px;
    }

    .workspace {
      display: flex;
      flex-direction: column;
    }

    .left {
      border-right: 0;
      border-bottom: 1px solid var(--line);
    }

    .right {
      overflow: visible;
      padding: 16px;
      border-top: 1px solid var(--line);
      border-left: 0;
    }

    .page-body {
      overflow: visible;
    }
  }

  @media (max-width: 520px) {
    .page-body {
      padding: 16px;
    }
  }
</style>
