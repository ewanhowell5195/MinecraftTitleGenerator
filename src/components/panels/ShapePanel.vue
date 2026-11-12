<script setup>
  import { computed, ref, shallowRef, watch } from "vue"
  import { EulaDeclined } from "../../lib/eula.js"
  import { latestRelease } from "../../lib/minecraft.js"
  import { keepVersions, modelList } from "../../lib/minecraftModels.js"
  import { usePanel } from "../../lib/panel.js"
  import { gameVersions, library } from "../../lib/scene.js"
  import { CUSTOM_SHAPE, isMinecraftShape, minecraftShape, minecraftShapeParts } from "../../lib/shapes.js"
  import { readFile } from "../../lib/ui.js"
  import MinecraftShapeTile from "../MinecraftShapeTile.vue"
  import MinecraftVersionField from "../MinecraftVersionField.vue"
  import Notice from "../Notice.vue"
  import Panel from "../Panel.vue"
  import Segments from "../Segments.vue"
  import Tile from "../Tile.vue"
  import TileGrid from "../TileGrid.vue"
  import UploadField from "../UploadField.vue"

  const SOURCES = [{ value: "premade", label: "Premade" }, { value: "minecraft", label: "Minecraft" }, { value: "custom", label: "Custom" }]
  const KINDS = [{ value: "block", label: "Blocks" }, { value: "item", label: "Items" }]

  const { object } = usePanel("shape")
  const minecraft = isMinecraftShape(object.value.shape)
  const source = ref(object.value.shape === CUSTOM_SHAPE ? "custom" : minecraft ? "minecraft" : "premade")
  const kind = ref(minecraft ? minecraftShapeParts(object.value.shape).kind : "block")
  const version = ref(object.value.shapeVersion)
  const search = ref("")
  const models = shallowRef(null)
  const failed = ref("")
  let listRequest = 0

  const shown = computed(() => {
    const term = search.value.trim().toLowerCase().replace(/\s+/g, "_")
    const ids = models.value?.[kind.value] ?? []
    return term ? ids.filter(id => id.includes(term)) : ids
  })

  function pick(id) {
    Object.assign(object.value, { shape: minecraftShape(kind.value, id), shapeVersion: version.value })
  }

  function pickPng(data) {
    Object.assign(object.value, { shape: CUSTOM_SHAPE, customFont: { kind: "silhouette", fileName: "shape.png", data } })
  }

  function chooseVersion(picked) {
    version.value = picked
    if (isMinecraftShape(object.value.shape)) object.value.shapeVersion = picked
  }

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
    } catch (err) {
      if (request !== listRequest) return
      if (err instanceof EulaDeclined) source.value = "premade"
      else failed.value = `Could not load the Minecraft models: ${err.message}`
    }
  }, { immediate: true })
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
          <p v-if="!models[kind].length" class="hint">Minecraft {{ version }} has no {{ kind === "block" ? "block states" : "item definitions" }} to pick from.</p>
          <template v-else>
            <input type="text" v-model="search" :placeholder="kind === 'block' ? 'Search blocks' : 'Search items'" :aria-label="kind === 'block' ? 'Search blocks' : 'Search items'">
            <TileGrid class="scroll">
              <MinecraftShapeTile v-for="id of shown" :key="`${version}/${kind}/${id}`" :kind="kind" :id="id" :version="version" :selected="object.shape === minecraftShape(kind, id) && object.shapeVersion === version" @pick="pick(id)" />
            </TileGrid>
          </template>
        </template>
      </template>
    </div>
  </Panel>
</template>
