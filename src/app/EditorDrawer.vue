<script setup>
  import { computed, ref, watch } from "vue"
  import Button from "../components/Button.vue"
  import Icon from "../components/Icon.vue"
  import Panel from "./Panel.vue"
  import Segments from "../components/Segments.vue"
  import "./panels/host.js"
  import DataPanel from "./panels/DataPanel.vue"
  import FontPanel from "./panels/FontPanel.vue"
  import TextPanel from "./panels/TextPanel.vue"
  import TransformPanel from "./panels/TransformPanel.vue"
  import { addObject, addShape, currentWord, shapingWord, wordTabs } from "../lib/state/scene.js"
  import { CAMERA_PANEL } from "../lib/panels/camera.js"
  import { FONT_PANEL } from "../lib/panels/fontSource.js"
  import { RENDER_PANELS, sectionPanels } from "../lib/panels/sections.js"
  import { FORM_SECTIONS, view } from "../lib/state/view.js"

  const SHAPE_TABS = [{ value: "line", label: "Whole line" }, { value: "word", label: "Current word" }]

  defineProps({
    editing: { type: Boolean, required: true },
    shapeLine: { type: Boolean, required: true }
  })

  const drawer = ref(null)
  const panels = computed(() => sectionPanels(view.section, currentWord.value.shape) ?? [])

  watch(() => [view.section, view.render, view.camera], () => {
    drawer.value.scrollTop = 0
  })
</script>

<template>
  <aside ref="drawer" class="drawer">
    <div v-if="!editing" class="intro row">
      <h2>{{ view.render ? "Render" : view.camera ? "Camera" : "No text" }}</h2>
    </div>
    <template v-if="view.render">
      <DataPanel v-for="panel of RENDER_PANELS" :key="panel.id" :panel="panel" />
    </template>
    <DataPanel v-else-if="view.camera" :panel="CAMERA_PANEL" />
    <Panel v-else-if="!editing">
      <Button primary wide @click="addObject"><template #icon><Icon name="letter" :size="16" /></template>
        <span>Add text</span>
      </Button>
      <Button wide @click="addShape"><template #icon><Icon name="star" :size="16" /></template>
        <span>Add shape</span>
      </Button>
    </Panel>
    <template v-else-if="FORM_SECTIONS.has(view.section)">
      <Panel v-if="wordTabs && !shapeLine">
        <Segments :options="SHAPE_TABS" v-model="view.shapeTab" />
        <p v-if="shapingWord" class="hint">Only changes "{{ currentWord.text.trim() }}", on top of the shape of the whole line.</p>
      </Panel>
      <DataPanel v-for="panel of panels" :key="`${shapingWord ? 'word' : 'line'}-${panel.id}`" :panel="panel" :word="shapingWord" />
      <TransformPanel v-if="view.section === 'transform'" :word="shapingWord" :key="shapingWord ? 'word-transform' : 'line-transform'" />
    </template>
    <template v-else>
      <TextPanel v-if="view.section === 'text'" />
      <template v-for="panel of panels" :key="`${view.section}-${panel.id}${panel.id === 'shape' ? currentWord.id : ''}`">
        <FontPanel v-if="panel === FONT_PANEL" />
        <DataPanel v-else :panel="panel" />
      </template>
    </template>
    <p class="disclaimer"><span>Not an official Minecraft product.</span> <span>Not approved by or associated with Mojang or Microsoft.</span></p>
  </aside>
</template>

<style scoped>
  .drawer {
    --group-padding: 20px;
    --disclaimer-height: 67px;
    grid-area: drawer;
    display: flex;
    flex-direction: column;
    min-height: 0;
    container-type: size;
    overflow-y: auto;
    scrollbar-gutter: stable;
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

  @media (max-width: 800px) {
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
