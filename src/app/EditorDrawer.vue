<script setup>
  import { ref, watch } from "vue"
  import Button from "../components/Button.vue"
  import Icon from "../components/Icon.vue"
  import Panel from "./Panel.vue"
  import Segments from "../components/Segments.vue"
  import "./panels/host.js"
  import DataPanel from "./panels/DataPanel.vue"
  import FontPanel from "./panels/FontPanel.vue"
  import ShapePanel from "./panels/ShapePanel.vue"
  import TextPanel from "./panels/TextPanel.vue"
  import TransformPanel from "./panels/TransformPanel.vue"
  import { addObject, addShape, currentWord, shapingWord, wordTabs } from "../lib/state/scene.js"
  import { CAMERA_PANEL } from "../lib/panels/camera.js"
  import { FACE_PANELS, FILTERS_PANEL, OUTLINE_PANEL } from "../lib/panels/colour.js"
  import { CREEPER_PANEL, CURVES_PANEL, SPACING_PANEL, TERMINATORS_PANEL } from "../lib/panels/font.js"
  import { ARC_PANEL, GEOMETRY_PANEL } from "../lib/panels/form.js"
  import { layersPanel } from "../lib/panels/layers.js"
  import { EDGE_OVERLAYS_PANEL, OVERLAYS_PANEL } from "../lib/panels/overlays.js"
  import { PLACEMENT_PANEL } from "../lib/panels/placement.js"
  import { FRAMING_PANEL, IMAGE_PANEL, SECOND_OUTLINE_PANEL } from "../lib/panels/render.js"
  import { TEXTURE_PANEL } from "../lib/panels/texture.js"
  import { TILING_PANEL } from "../lib/panels/tiling.js"
  import { TWIST_PANELS } from "../lib/panels/twists.js"
  import { FORM_SECTIONS, view } from "../lib/state/view.js"

  const FONT_PANELS = [CURVES_PANEL, CREEPER_PANEL, TERMINATORS_PANEL, SPACING_PANEL]
  const RENDER_PANELS = [FRAMING_PANEL, SECOND_OUTLINE_PANEL, IMAGE_PANEL]
  const LOOK_PANELS = {
    texture: [layersPanel("texture"), TEXTURE_PANEL, TILING_PANEL],
    colour: [layersPanel("colour"), FILTERS_PANEL].concat(FACE_PANELS, OUTLINE_PANEL),
    overlays: [layersPanel("overlays"), OVERLAYS_PANEL, EDGE_OVERLAYS_PANEL]
  }
  const SHAPE_TABS = [{ value: "line", label: "Whole line" }, { value: "word", label: "Current word" }]

  defineProps({
    editing: { type: Boolean, required: true },
    shapeLine: { type: Boolean, required: true }
  })

  const drawer = ref(null)

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
    <template v-else-if="view.section === 'text'">
      <TextPanel />
      <DataPanel :panel="PLACEMENT_PANEL" />
    </template>
    <template v-else-if="view.section === 'font'">
      <FontPanel />
      <DataPanel v-for="panel of FONT_PANELS" :key="panel.id" :panel="panel" />
    </template>
    <ShapePanel v-else-if="view.section === 'shape'" :key="currentWord.id" />
    <DataPanel v-else-if="view.section === 'placement'" :panel="PLACEMENT_PANEL" />
    <template v-else-if="LOOK_PANELS[view.section]">
      <DataPanel v-for="panel of LOOK_PANELS[view.section]" :key="`${view.section}-${panel.id}`" :panel="panel" />
    </template>
    <template v-else-if="FORM_SECTIONS.has(view.section)">
      <Panel v-if="wordTabs && !shapeLine">
        <Segments :options="SHAPE_TABS" v-model="view.shapeTab" />
        <p v-if="shapingWord" class="hint">Only changes "{{ currentWord.text.trim() }}", on top of the shape of the whole line.</p>
      </Panel>
      <template v-if="view.section === 'form'">
        <DataPanel :panel="GEOMETRY_PANEL" :word="shapingWord" :key="shapingWord ? 'word-geometry' : 'line-geometry'" />
        <template v-if="!shapeLine">
          <DataPanel :panel="ARC_PANEL" :word="shapingWord" :key="shapingWord ? 'word-arc' : 'line-arc'" />
          <DataPanel v-for="panel of TWIST_PANELS" :key="`${shapingWord ? 'word' : 'line'}-${panel.id}`" :panel="panel" :word="shapingWord" />
        </template>
      </template>
      <TransformPanel v-else :word="shapingWord" :key="shapingWord ? 'word-transform' : 'line-transform'" />
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
