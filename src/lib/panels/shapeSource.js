import { computed, ref, shallowRef, watch } from "vue"
import { EulaDeclined } from "../minecraft/eula.js"
import { latestRelease } from "../minecraft/minecraft.js"
import { fitComponents, itemControls } from "../minecraft/itemComponents.js"
import { blockStates, fitState, itemDefinition, keepVersions, modelList } from "../minecraft/minecraftModels.js"
import { CUSTOM_SHAPE, isMinecraftShape, minecraftShape, minecraftShapeParts } from "../geometry/shapes.js"
import { silhouetteMesh } from "../font/customFonts.js"
import { host } from "./host.js"
import { usePanel } from "./panel.js"
import { usedShapes } from "./uploads.js"

export const SHAPE_SOURCES = [{ value: "premade", label: "Premade" }, { value: "minecraft", label: "Minecraft" }, { value: "custom", label: "Custom" }]
export const SHAPE_KINDS = [{ value: "block", label: "Blocks" }, { value: "item", label: "Items" }]
const STARTING_SHAPES = { block: "cobblestone", item: "diamond_sword" }

export function useShapeSource() {
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
