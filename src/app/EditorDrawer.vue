<script setup>
  import { ref, watch } from "vue"
  import Button from "../components/Button.vue"
  import Icon from "../components/Icon.vue"
  import Panel from "./Panel.vue"
  import Segments from "../components/Segments.vue"
  import ArcPanel from "./panels/ArcPanel.vue"
  import CameraPanel from "./panels/CameraPanel.vue"
  import ColourPanel from "./panels/ColourPanel.vue"
  import FontPanel from "./panels/FontPanel.vue"
  import GeometryPanel from "./panels/GeometryPanel.vue"
  import LayerPanel from "./panels/LayerPanel.vue"
  import OverlaysPanel from "./panels/OverlaysPanel.vue"
  import PlacementPanel from "./panels/PlacementPanel.vue"
  import RenderPanel from "./panels/RenderPanel.vue"
  import ShapePanel from "./panels/ShapePanel.vue"
  import SpacingPanel from "./panels/SpacingPanel.vue"
  import TextPanel from "./panels/TextPanel.vue"
  import TexturePanel from "./panels/TexturePanel.vue"
  import TransformPanel from "./panels/TransformPanel.vue"
  import TwistPanel from "./panels/TwistPanel.vue"
  import { active, addObject, addShape, currentWord, shapingWord, wordTabs } from "../lib/state/scene.js"
  import { FORM_SECTIONS, view } from "../lib/state/view.js"

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
          <TwistPanel v-for="kind of ['ribbon', 'wrap', 'fan']" :key="`${shapingWord ? 'word' : 'line'}-${kind}`" :kind="kind" :word="shapingWord" />
        </template>
      </template>
      <TransformPanel v-else :word="shapingWord" />
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
