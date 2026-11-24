<script setup>
  import { titleCase } from "../../lib/core/names.js"
  import { CUSTOM_SHAPE, minecraftShape } from "../../lib/geometry/shapes.js"
  import { BUILDS } from "../../lib/panels/fontSource.js"
  import { SHAPE_KINDS, SHAPE_SOURCES, useShapeSource } from "../../lib/panels/shapeSource.js"
  import { readImage } from "../../lib/state/imageFiles.js"
  import { library } from "../../lib/state/scene.js"
  import ColourPicker from "../../components/ColourPicker.vue"
  import Dropdown from "../../components/Dropdown.vue"
  import Field from "../../components/Field.vue"
  import MinecraftShapeTile from "../MinecraftShapeTile.vue"
  import MinecraftVersionField from "../MinecraftVersionField.vue"
  import Notice from "../../components/Notice.vue"
  import Panel from "../Panel.vue"
  import Segments from "../../components/Segments.vue"
  import Tile from "../../components/Tile.vue"
  import TileGrid from "../../components/TileGrid.vue"
  import Toggle from "../../components/Toggle.vue"
  import UploadField from "../../components/UploadField.vue"
  import UploadReuse from "../../components/UploadReuse.vue"

  const { chooseVersion, clearPng, componentsCustomised, componentsShown, controls, customised, failed, kind, models, object, pick, pickPng, reusable, search, setBuild, setState, shown, source, states, version } = useShapeSource()
</script>

<template>
  <Panel title="Shape">
    <div class="flow" :class="{ pick: source === 'minecraft' }">
      <Segments :options="SHAPE_SOURCES" v-model="source" />
      <TileGrid v-if="source === 'premade'">
        <Tile v-for="shape of library.shapes" :key="shape.id" :label="shape.name" :image="`${shape.folder}/thumbnails/flat.png`" aspect="4 / 3" :author="shape.authors" :selected="object.shape === shape.id" @pick="object.shape = shape.id" />
      </TileGrid>
      <template v-else-if="source === 'custom'">
        <UploadField accept="image/*" :label="object.shape === CUSTOM_SHAPE ? 'Replace image' : 'Choose an image'" empty="No image chosen" :image="object.shape === CUSTOM_SHAPE ? object.customFont?.data : null" :clearable="object.shape === CUSTOM_SHAPE" :back="reusable.length > 0" @change="readImage($event, pickPng)" @clear="clearPng" />
        <p class="hint">The solid pixels make the shape, pushed out like a letter, and the image paints its front.</p>
        <Segments v-if="object.shape === CUSTOM_SHAPE && object.customFont" label="Build from" :options="BUILDS" :model-value="!!object.customFont.mesh" :hint="object.customFont.mesh ? 'Smooth edges that follow the outline of the image.' : 'Pixel cubes, like the letters.'" @update:model-value="setBuild" />
        <UploadReuse :items="reusable" @pick="pickPng" />
      </template>
      <template v-else>
        <MinecraftVersionField v-if="version" :version="version" @pick="chooseVersion" />
        <Notice v-if="failed">{{ failed }}</Notice>
        <template v-if="models">
          <Segments :options="SHAPE_KINDS" v-model="kind" />
          <p v-if="!models[kind].length" class="hint">Minecraft {{ version }} has no {{ kind === "block" ? "blockstates" : "item definitions" }} to pick from.</p>
          <template v-else>
            <input type="text" v-model="search" :placeholder="kind === 'block' ? 'Search blocks' : 'Search items'" :aria-label="kind === 'block' ? 'Search blocks' : 'Search items'">
            <TileGrid class="scroll">
              <MinecraftShapeTile v-for="id of shown" :key="`${version}/${kind}/${id}`" :kind="kind" :id="id" :version="version" :selected="object.shape === minecraftShape(kind, id) && object.shapeVersion === version" @pick="pick(id)" />
            </TileGrid>
          </template>
          <template v-if="states.length">
            <Toggle label="Customise blockstate" v-model="customised" />
            <div v-if="object.blockState" class="states">
              <Dropdown v-for="state of states" :key="state.name" :label="titleCase(state.name)" :options="state.values.map(value => ({ value, label: titleCase(value) }))" :model-value="object.blockState[state.name] ?? state.value" @update:model-value="setState(state.name, $event)" />
            </div>
          </template>
          <template v-if="componentsShown">
            <Toggle label="Customise components" v-model="componentsCustomised" />
            <div v-if="object.itemComponents" class="states">
              <template v-for="control of controls" :key="control.key">
                <Dropdown v-if="control.type === 'select'" :label="control.label" :options="control.options" :searchable="control.options.length > 12" :model-value="control.value" @update:model-value="object.itemComponents = control.choose($event)" />
                <Toggle v-else-if="control.type === 'toggle'" class="wide" :label="control.label" :model-value="control.value" @update:model-value="object.itemComponents = control.choose($event)" />
                <Field v-else group :label="control.label">
                  <ColourPicker :model-value="control.value" @update:model-value="object.itemComponents = control.choose($event)" />
                </Field>
              </template>
            </div>
          </template>
        </template>
      </template>
    </div>
  </Panel>
</template>

<style scoped>
  .states {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .wide {
    grid-column: 1 / -1;
  }
</style>
