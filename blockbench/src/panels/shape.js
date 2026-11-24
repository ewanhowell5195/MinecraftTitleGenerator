import { titleCase } from "../../../src/lib/core/names.js"
import { CUSTOM_SHAPE, minecraftShape } from "../../../src/lib/geometry/shapes.js"
import { BUILDS } from "../../../src/lib/panels/fontSource.js"
import { SHAPE_KINDS, SHAPE_SOURCES, useShapeSource } from "../../../src/lib/panels/shapeSource.js"
import { selectedElements } from "../host.js"
import { library } from "../library.js"
import { beginEdit, edit, finishEdit } from "../undo.js"
import { INPUTS } from "./inputs.js"
import { DownloadProgress, ModelTile, VersionControl } from "./minecraft.js"
import { TILES, readImage } from "./tiles.js"

const LABEL = "Change title shape"

export const ShapeGroup = {
  components: { ...INPUTS, ...TILES, DownloadProgress, ModelTile, VersionControl },
  setup() {
    const state = useShapeSource()

    function change(action) {
      edit(selectedElements(), LABEL, action)
    }

    function upload(files) {
      readImage(files, data => change(() => state.pickPng(data)))
    }

    function colour(control, value) {
      beginEdit(selectedElements(), `shape-${control.key}`)
      state.object.value.itemComponents = control.choose(value)
    }

    return { ...state, BUILDS, CUSTOM_SHAPE, SHAPE_KINDS, SHAPE_SOURCES, change, colour, done: () => finishEdit(LABEL), library, minecraftShape, options: values => values.map(value => ({ value, label: titleCase(value) })), titleCase, upload }
  },
  template: `
    <section class="mtg-group">
      <div class="mtg-head"><h3>Shape</h3></div>
      <div class="mtg-controls">
        <segments-control :options="SHAPE_SOURCES" :value="source" @change="change(() => (source = $event))" />
        <div v-if="source === 'premade'" class="mtg-grid mtg-scroll">
          <title-tile v-for="shape of library.shapes" :key="shape.id" :label="shape.name" :image="shape.folder + '/thumbnails/flat.png'" aspect="4 / 3" :author="shape.authors" :selected="object.shape === shape.id" @pick="change(() => (object.shape = shape.id))" />
        </div>
        <template v-else-if="source === 'custom'">
          <upload-control accept="image/*" :label="object.shape === CUSTOM_SHAPE ? 'Replace image' : 'Choose an image'" empty="No image chosen" :image="object.shape === CUSTOM_SHAPE && object.customFont ? object.customFont.data : null" :clearable="object.shape === CUSTOM_SHAPE" @files="upload" @clear="change(clearPng)" />
          <p class="mtg-hint">The solid pixels make the shape, pushed out like a letter, and the image paints its front.</p>
          <segments-control v-if="object.shape === CUSTOM_SHAPE && object.customFont" label="Build from" :options="BUILDS" :value="!!object.customFont.mesh" :hint="object.customFont.mesh ? 'Smooth edges that follow the outline of the image.' : 'Pixel cubes, like the letters.'" @change="change(() => setBuild($event))" />
          <reuse-tiles :items="reusable" @pick="change(() => pickPng($event))" />
        </template>
        <template v-else>
          <version-control v-if="version" :version="version" @pick="change(() => chooseVersion($event))" />
          <p v-if="failed" class="mtg-error">{{ failed }}</p>
          <template v-if="models">
            <segments-control :options="SHAPE_KINDS" :value="kind" @change="change(() => (kind = $event))" />
            <p v-if="!models[kind].length" class="mtg-hint">Minecraft {{ version }} has no {{ kind === 'block' ? 'blockstates' : 'item definitions' }} to pick from.</p>
            <template v-else>
              <search-bar v-model="search" />
              <div class="mtg-grid mtg-scroll">
                <model-tile v-for="id of shown" :key="version + '/' + kind + '/' + id" :kind="kind" :id="id" :version="version" :selected="object.shape === minecraftShape(kind, id) && object.shapeVersion === version" @pick="change(() => pick(id))" />
              </div>
            </template>
            <template v-if="states.length">
              <toggle-control label="Customise blockstate" :value="customised" @change="change(() => (customised = $event))" />
              <template v-if="object.blockState">
                <dropdown-control v-for="state of states" :key="state.name" :label="titleCase(state.name)" :options="options(state.values)" :value="object.blockState[state.name] || state.value" @change="change(() => setState(state.name, $event))" />
              </template>
            </template>
            <template v-if="componentsShown">
              <toggle-control label="Customise components" :value="componentsCustomised" @change="change(() => (componentsCustomised = $event))" />
              <template v-if="object.itemComponents">
                <template v-for="control of controls">
                  <dropdown-control v-if="control.type === 'select'" :key="control.key" :label="control.label" :options="control.options" :value="control.value" @change="change(() => (object.itemComponents = control.choose($event)))" />
                  <toggle-control v-else-if="control.type === 'toggle'" :key="control.key" :label="control.label" :value="!!control.value" @change="change(() => (object.itemComponents = control.choose($event)))" />
                  <div v-else :key="control.key" class="mtg-field">
                    <label>{{ control.label }}</label>
                    <colour-control :value="control.value" @change="colour(control, $event)" @done="done" />
                  </div>
                </template>
              </template>
            </template>
          </template>
        </template>
      </div>
    </section>
  `
}
