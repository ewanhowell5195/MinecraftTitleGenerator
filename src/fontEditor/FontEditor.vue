<script setup>
  import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue"
  import FluidTabs from "fluid-tabs-vue"
  import AccountMenu from "../components/AccountMenu.vue"
  import NotificationBell from "../components/NotificationBell.vue"
  import Icon from "../components/Icon.vue"
  import MenuStrip from "../components/MenuStrip.vue"
  import RenderDialog from "../components/RenderDialog.vue"
  import CharacterList from "./CharacterList.vue"
  import CharacterPanel from "./CharacterPanel.vue"
  import FontPanel from "./FontPanel.vue"
  import GlyphCanvas from "./GlyphCanvas.vue"
  import KerningPanel from "./KerningPanel.vue"
  import PreviewPanel from "./PreviewPanel.vue"
  import TexturesPanel from "./TexturesPanel.vue"
  import StartScreen from "./StartScreen.vue"
  import { canRedo, canUndo, closeFont, downloadJson, downloadTexture, flushSave, font, redo, restoreFont, saveError, submitFont, typing, undo } from "./store.js"

  const TABS = [{ id: "font", label: "Font" }, { id: "characters", label: "Characters" }, { id: "textures", label: "Textures" }, { id: "kerning", label: "Kerning" }]

  const TAB_KEY = "minecraft-title-font-editor-tab"

  const tab = ref(savedTab())

  function savedTab() {
    const saved = localStorage.getItem(TAB_KEY)
    return TABS.some(item => item.id === saved) ? saved : "characters"
  }

  const asking = ref(false)
  const loadError = ref("")

  const menus = computed(() => ({
    File: [
      { label: "New font...", icon: "plus", action: () => asking.value = true },
      { label: "Save", icon: "download", action: downloadJson },
      { label: "Save texture", icon: "download", action: downloadTexture }
    ],
    Edit: [
      { label: "Undo", icon: "undo", disabled: !canUndo.value, keepOpen: true, action: undo },
      { label: "Redo", icon: "redo", disabled: !canRedo.value, keepOpen: true, action: redo }
    ]
  }))

  watch(tab, value => localStorage.setItem(TAB_KEY, value))

  try {
    restoreFont()
  } catch (err) {
    loadError.value = `Your saved font couldn't be opened: ${err.message}`
  }

  function key(event) {
    const letter = event.key.toLowerCase()
    if (!font.value || !(event.ctrlKey || event.metaKey) || !["y", "z"].includes(letter) || typing(event.target)) return
    event.preventDefault()
    if (letter === "z" && !event.shiftKey) undo()
    else redo()
  }

  function startAgain() {
    asking.value = false
    closeFont()
    tab.value = "characters"
  }

  onMounted(() => {
    addEventListener("keydown", key)
    addEventListener("pagehide", flushSave)
  })

  onBeforeUnmount(() => {
    removeEventListener("keydown", key)
    removeEventListener("pagehide", flushSave)
  })
</script>

<template>
  <div class="editor-page">
    <header class="top" :class="{ editing: font }">
      <a class="brand" href="/"><img src="/favicon.svg" alt="" width="24" height="24"><span>Minecraft Title Generator</span></a>
      <template v-if="font">
        <MenuStrip :menus="menus" />
        <span class="name ellipsis">{{ font.name }}</span>
        <FluidTabs class="main-tabs" v-model="tab" :tabs="TABS" tab-style="nav">
          <template #label="{ tab: item }"><span>{{ item.label }}</span></template>
        </FluidTabs>
      </template>
      <div class="spacer"></div>
      <button v-if="font" title="Send this font to be added to the title generator" @click="submitFont"><Icon name="upload" :size="14" />Submit</button>
      <AccountMenu />
      <NotificationBell />
    </header>

    <p v-if="loadError" class="notice">{{ loadError }}</p>
    <p v-if="saveError" class="notice">{{ saveError }}</p>

    <StartScreen v-if="!font" />

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
        <FontPanel v-if="tab === 'font'" class="page-column" />
        <TexturesPanel v-else-if="tab === 'textures'" class="page-column wide" />
        <KerningPanel v-else class="page-column wide" />
      </div>
      <PreviewPanel v-if="tab !== 'textures'" />
    </main>

    <RenderDialog v-if="asking" title="Start a new font?" close-title="Cancel" dismissable @close="asking = false">
      <div class="dialog-body">
        <p>This browser only remembers one font, so <strong>{{ font.name }}</strong> will be removed. Download its JSON first if you want to keep it.</p>
        <div class="buttons">
          <button @click="downloadJson"><Icon name="download" :size="14" />Download JSON</button>
          <div class="spacer"></div>
          <button @click="asking = false">Cancel</button>
          <button class="danger" @click="startAgain">Start new font</button>
        </div>
      </div>
    </RenderDialog>
  </div>
</template>

<style scoped>
  .editor-page {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }

  .top {
    flex: none;
    display: flex;
    align-items: center;
    gap: 8px;
    height: 52px;
    padding: 0 12px;
    background: var(--surface);
    border-bottom: 1px solid var(--line);
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
    font-weight: 700;
    color: var(--text);
    text-decoration: none;
    user-select: none;
    white-space: nowrap;
  }

  .name {
    min-width: 0;
    margin-left: 8px;
    padding-left: 12px;
    font-size: var(--font-md);
    color: var(--muted);
    border-left: 1px solid var(--line-strong);
  }

  .notice {
    flex: none;
    margin: 0;
    padding: 8px 14px;
    font-size: var(--font-md);
    color: #1d0a08;
    background: var(--danger);
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
    margin-left: 8px;
  }

  .main-tabs :deep(.tab-bar) {
    height: 100%;
    margin: 0;
    box-shadow: none;
  }

  .main-tabs :deep(.tab-bar-button) {
    padding: 0 14px;
    font-size: var(--font-md);
    font-weight: 600;
    color: var(--faint);
  }

  .main-tabs :deep(.tab-bar-button:hover) {
    color: var(--text);
  }

  .main-tabs :deep(.tab-bar-button.active) {
    color: var(--accent);
  }

  .main-tabs :deep(.tab-bar-active) {
    bottom: 0;
    border-top: none;
    border-bottom: 2px solid var(--accent);
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

  .buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
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
      height: auto;
      min-height: 52px;
    }

    .brand {
      height: 52px;
    }

    .main-tabs {
      order: 10;
      flex-basis: calc(100% + 24px);
      height: 44px;
      margin: 0 -12px;
      border-top: 1px solid var(--line);
    }

    .main-tabs :deep(.tab-bar) {
      width: 100%;
    }

    .main-tabs :deep(.tab-bar-button) {
      flex: 1;
      padding: 0 6px;
    }

    .name {
      display: none;
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
    .editing .brand span {
      display: none;
    }

    .top {
      gap: 2px;
      padding: 0 8px;
    }

    .main-tabs {
      flex-basis: calc(100% + 16px);
      margin: 0 -8px;
    }

    .page-body {
      padding: 16px;
    }
  }
</style>
