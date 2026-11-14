<script setup>
  import { computed, ref, shallowRef, watch } from "vue"
  import { EulaDeclined } from "../../lib/eula.js"
  import { latestRelease } from "../../lib/minecraft.js"
  import { fitComponents, itemControls } from "../../lib/itemComponents.js"
  import { blockStates, fitState, itemDefinition, keepVersions, modelList } from "../../lib/minecraftModels.js"
  import { titleCase } from "../../lib/names.js"
  import { usePanel } from "../../lib/panel.js"
  import { gameVersions, library } from "../../lib/scene.js"
  import { CUSTOM_SHAPE, isMinecraftShape, minecraftShape, minecraftShapeParts } from "../../lib/shapes.js"
  import { readFile } from "../../lib/ui.js"
  import ColourPicker from "../ColourPicker.vue"
  import Dropdown from "../Dropdown.vue"
  import Field from "../Field.vue"
  import MinecraftShapeTile from "../MinecraftShapeTile.vue"
  import MinecraftVersionField from "../MinecraftVersionField.vue"
  import Notice from "../Notice.vue"
  import Panel from "../Panel.vue"
  import Segments from "../Segments.vue"
  import Tile from "../Tile.vue"
  import TileGrid from "../TileGrid.vue"
  import Toggle from "../Toggle.vue"
  import UploadField from "../UploadField.vue"

  const SOURCES = [{ value: "premade", label: "Premade" }, { value: "minecraft", label: "Minecraft" }, { value: "custom", label: "Custom" }]
  const KINDS = [{ value: "block", label: "Blocks" }, { value: "item", label: "Items" }]
  const STARTING_SHAPES = { block: "cobblestone", item: "diamond_sword" }

  const { object } = usePanel("shape")
  const minecraft = isMinecraftShape(object.value.shape)
  const source = ref(object.value.shape === CUSTOM_SHAPE ? "custom" : minecraft ? "minecraft" : "premade")
  const kind = ref(minecraft ? minecraftShapeParts(object.value.shape).kind : "block")
  const version = ref(object.value.shapeVersion)
  const search = ref("")
  const models = shallowRef(null)
  const failed = ref("")
  const states = shallowRef([])
  const definition = shallowRef(null)
  let listRequest = 0
  let stateRequest = 0

  const shown = computed(() => {
    const term = search.value.trim().toLowerCase().replace(/\s+/g, "_")
    const ids = models.value?.[kind.value] ?? []
    return term ? ids.filter(id => id.includes(term)) : ids
  })

  const customised = computed({
    get: () => object.value.blockState !== null,
    set: on => object.value.blockState = on ? fitState(states.value, null) : null
  })

  const componentsShown = computed(() => !!definition.value?.definition && fitComponents(definition.value.definition, {}, definition.value.potions) !== null)

  const componentsCustomised = computed({
    get: () => object.value.itemComponents !== null,
    set: on => object.value.itemComponents = on ? {} : null
  })

  const controls = computed(() => definition.value?.definition && object.value.itemComponents ? itemControls(definition.value.definition, object.value.itemComponents, definition.value.potions) : [])

  function picked(shape, wanted) {
    if (!isMinecraftShape(shape)) return null
    const parts = minecraftShapeParts(shape)
    return parts.kind === wanted ? parts.id : null
  }

  async function fittedState(shape, shapeVersion, previous) {
    const block = picked(shape, "block")
    if (!previous || !block) return null
    const list = await blockStates(block, shapeVersion)
    return list.length ? fitState(list, previous) : null
  }

  async function fittedComponents(shape, shapeVersion, previous) {
    const item = picked(shape, "item")
    if (!previous || !item) return null
    const loaded = await itemDefinition(item, shapeVersion)
    return loaded.definition ? fitComponents(loaded.definition, previous, loaded.potions) : null
  }

  async function setShape(shape, shapeVersion) {
    const target = object.value
    const [blockState, itemComponents] = await Promise.all([fittedState(shape, shapeVersion, target.blockState), fittedComponents(shape, shapeVersion, target.itemComponents)])
    Object.assign(target, { shape, shapeVersion, blockState, itemComponents })
  }

  function pick(id) {
    setShape(minecraftShape(kind.value, id), version.value)
  }

  function pickPng(data) {
    Object.assign(object.value, { shape: CUSTOM_SHAPE, customFont: { kind: "silhouette", fileName: "shape.png", data } })
  }

  function chooseVersion(picked) {
    version.value = picked
    if (isMinecraftShape(object.value.shape)) setShape(object.value.shape, picked)
  }

  function pickStarting() {
    const ids = models.value?.[kind.value]
    if (!ids?.length || ids.some(id => object.value.shape === minecraftShape(kind.value, id))) return
    pick(ids.includes(STARTING_SHAPES[kind.value]) ? STARTING_SHAPES[kind.value] : ids[0])
  }

  function setState(name, value) {
    object.value.blockState = { ...object.value.blockState, [name]: value }
  }

  watch(() => [object.value.shape, object.value.shapeVersion], async ([shape, shapeVersion]) => {
    const request = ++stateRequest
    states.value = []
    definition.value = null
    const block = picked(shape, "block")
    const item = picked(shape, "item")
    if (!block && !item || !shapeVersion) return
    try {
      const loaded = block ? await blockStates(block, shapeVersion) : await itemDefinition(item, shapeVersion)
      if (request !== stateRequest) return
      if (block) states.value = loaded
      else definition.value = loaded
    } catch (err) {
      if (request === stateRequest) failed.value = `Could not read the ${block ? "blockstates" : "item definition"}: ${err.message}`
    }
  }, { immediate: true })

  watch([source, version], async () => {
    if (source.value !== "minecraft") return
    const request = ++listRequest
    failed.value = ""
    models.value = null
    try {
      if (!version.value) version.value = await latestRelease()
      const listed = await modelList(version.value)
      if (request !== listRequest) return
      models.value = listed
      keepVersions(gameVersions(version.value))
      pickStarting()
    } catch (err) {
      if (request !== listRequest) return
      if (err instanceof EulaDeclined) source.value = "premade"
      else failed.value = `Could not load the Minecraft models: ${err.message}`
    }
  }, { immediate: true })

  watch(kind, pickStarting)
</script>

<template>
  <Panel title="Shape">
    <div class="flow" :class="{ pick: source === 'minecraft' }">
      <Segments :options="SOURCES" v-model="source" />
      <TileGrid v-if="source === 'premade'">
        <Tile v-for="shape of library.shapes" :key="shape.id" :label="shape.name" :image="`${shape.folder}/thumbnails/flat.png`" aspect="4 / 3" :author="shape.authors" :selected="object.shape === shape.id" @pick="object.shape = shape.id" />
      </TileGrid>
      <template v-else-if="source === 'custom'">
        <UploadField accept="image/png" :label="object.shape === CUSTOM_SHAPE ? 'Replace PNG' : 'Choose a PNG'" empty="No PNG chosen" :image="object.shape === CUSTOM_SHAPE ? object.customFont?.data : null" @change="readFile($event, pickPng)" />
        <p class="hint">The solid pixels make the shape, pushed out like a letter, and the PNG paints its front.</p>
      </template>
      <template v-else>
        <MinecraftVersionField v-if="version" :version="version" @pick="chooseVersion" />
        <Notice v-if="failed">{{ failed }}</Notice>
        <template v-if="models">
          <Segments :options="KINDS" v-model="kind" />
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
