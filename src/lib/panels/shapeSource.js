import { computed, ref, shallowRef, watch } from "vue"
import { titleCase } from "../core/names.js"
import { EulaDeclined } from "../minecraft/eula.js"
import { latestRelease } from "../minecraft/minecraft.js"
import { fitComponents, itemControls } from "../minecraft/itemComponents.js"
import { blockStates, fitState, itemDefinition, keepVersions, modelList } from "../minecraft/minecraftModels.js"
import { CUSTOM_SHAPE, isMinecraftShape, minecraftShape, minecraftShapeParts } from "../geometry/shapes.js"
import { silhouetteMesh } from "../font/customFonts.js"
import { BUILDS } from "./fontSource.js"
import { host } from "./host.js"
import { usePanel } from "./panel.js"
import { reuseRow, usedShapes } from "./uploads.js"

const SHAPE_SOURCES = [{ value: "premade", label: "Premade" }, { value: "minecraft", label: "Minecraft" }, { value: "custom", label: "Custom" }]
const SHAPE_KINDS = [{ value: "block", label: "Blocks" }, { value: "item", label: "Items" }]
const STARTING_SHAPES = { block: "cobblestone", item: "diamond_sword" }

function useShapeSource() {
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

  async function pickPng(data) {
    const target = object.value
    const mesh = await silhouetteMesh(data)
    Object.assign(target, { shape: CUSTOM_SHAPE, customFont: { kind: "silhouette", fileName: "shape.png", data, mesh } })
  }

  function setBuild(mesh) {
    object.value.customFont = { ...object.value.customFont, mesh }
  }

  const reusable = computed(() => usedShapes().filter(item => object.value.shape !== CUSTOM_SHAPE || item.value !== object.value.customFont?.data).map(item => ({ ...item, image: item.value })))

  function clearPng() {
    Object.assign(object.value, { shape: host.library.shapes[0].id, customFont: null })
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

  watch([() => object.value.shape, () => object.value.shapeVersion], async ([shape, shapeVersion]) => {
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
      keepVersions(host.gameVersions(version.value))
      pickStarting()
    } catch (err) {
      if (request !== listRequest) return
      if (err instanceof EulaDeclined) source.value = "premade"
      else failed.value = `Could not load the Minecraft models: ${err.message}`
    }
  }, { immediate: true })

  watch(kind, pickStarting)

  return { chooseVersion, clearPng, componentsCustomised, componentsShown, controls, customised, failed, kind, models, object, pick, pickPng, reusable, search, setBuild, setState, shown, source, states, version }
}

const SEARCHABLE_OPTIONS = 12

const from = source => (get, { state }) => state.source.value === source
const custom = from("custom")
const shaped = get => get("shape") === CUSTOM_SHAPE
const minecraft = (get, { state }) => state.source.value === "minecraft"
const listed = (get, context) => minecraft(get, context) && !!context.state.models.value
const filled = (get, context) => listed(get, context) && context.state.models.value[context.state.kind.value].length > 0

function premadeTiles(get, { object }) {
  return host.library.shapes.map(shape => ({ key: shape.id, label: shape.name, image: `${shape.folder}/thumbnails/flat.png`, aspect: "4 / 3", author: shape.authors, selected: get("shape") === shape.id, pick: () => (object.shape = shape.id) }))
}

function modelTiles(get, { state }) {
  const [kind, version] = [state.kind.value, state.version.value]
  return state.shown.value.map(id => ({ key: `${version}/${kind}/${id}`, label: titleCase(id), model: { kind, id, version }, selected: get("shape") === minecraftShape(kind, id) && get("shapeVersion") === version, pick: () => state.pick(id) }))
}

function stateControls(get, { state }) {
  return state.states.value.map(({ name, value, values }) => ({ type: "dropdown", id: name, label: titleCase(name), options: values.map(option => ({ value: option, label: titleCase(option) })), read: () => get("blockState")[name] ?? value, write: picked => state.setState(name, picked) }))
}

const CONTROL_TYPES = { select: "dropdown", toggle: "toggle" }

function componentControls(get, { object, state }) {
  return state.controls.value.map(control => ({
    type: CONTROL_TYPES[control.type] ?? "colour",
    id: control.key,
    label: control.label,
    options: control.options,
    searchable: control.options?.length > SEARCHABLE_OPTIONS,
    wide: control.type === "toggle",
    read: () => control.value,
    write: value => (object.itemComponents = control.choose(value))
  }))
}

export const SHAPE_PANEL = {
  id: "shape",
  title: "Shape",
  setup: useShapeSource,
  modified: () => false,
  controls: [
    {
      type: "picker",
      pick: minecraft,
      boxed: (get, context) => !custom(get, context),
      floor: () => false,
      controls: [
        { type: "segments", options: SHAPE_SOURCES, read: (get, { state }) => state.source.value, write: (value, { state }) => (state.source.value = value) },
        { type: "tiles", items: premadeTiles, shown: from("premade") },
        {
          type: "upload",
          accept: "image/*",
          view: (get, { state }) => ({ label: shaped(get) ? "Replace image" : "Choose an image", empty: "No image chosen", image: shaped(get) ? get("customFont")?.data : null, clearable: shaped(get), back: state.reusable.value.length > 0 }),
          pick: (data, { state }) => state.pickPng(data),
          clear: ({ state }) => state.clearPng(),
          shown: custom
        },
        { type: "hint", text: "The solid pixels make the shape, pushed out like a letter, and the image paints its front.", shown: custom },
        { type: "segments", label: "Build from", options: BUILDS, hint: get => get("customFont").mesh ? "Smooth edges that follow the outline of the image." : "Pixel cubes, like the letters.", read: get => !!get("customFont").mesh, write: (mesh, { state }) => state.setBuild(mesh), shown: (get, context) => custom(get, context) && shaped(get) && !!get("customFont") },
        reuseRow((data, { state }) => state.pickPng(data), custom),
        { type: "version", read: (get, { state }) => state.version.value, write: (version, { state }) => state.chooseVersion(version), shown: (get, context) => minecraft(get, context) && !!context.state.version.value },
        { type: "notice", text: (get, { state }) => state.failed.value, shown: (get, context) => minecraft(get, context) && !!context.state.failed.value },
        { type: "segments", options: SHAPE_KINDS, read: (get, { state }) => state.kind.value, write: (kind, { state }) => (state.kind.value = kind), shown: listed },
        { type: "hint", text: (get, { state }) => `Minecraft ${state.version.value} has no ${state.kind.value === "block" ? "blockstates" : "item definitions"} to pick from.`, shown: (get, context) => listed(get, context) && !filled(get, context) },
        { type: "search", placeholder: (get, { state }) => state.kind.value === "block" ? "Search blocks" : "Search items", shown: filled },
        { type: "tiles", scroll: true, items: modelTiles, shown: filled },
        { type: "toggle", label: "Customise blockstate", read: (get, { state }) => state.customised.value, write: (on, { state }) => (state.customised.value = on), shown: (get, context) => listed(get, context) && context.state.states.value.length > 0 },
        { type: "stack", grid: true, controls: stateControls, shown: (get, context) => listed(get, context) && context.state.states.value.length > 0 && !!get("blockState") },
        { type: "toggle", label: "Customise components", read: (get, { state }) => state.componentsCustomised.value, write: (on, { state }) => (state.componentsCustomised.value = on), shown: (get, context) => listed(get, context) && context.state.componentsShown.value },
        { type: "stack", grid: true, controls: componentControls, shown: (get, context) => listed(get, context) && context.state.componentsShown.value && !!get("itemComponents") }
      ]
    }
  ]
}
