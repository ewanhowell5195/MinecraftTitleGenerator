import { shallowRef, watch } from "vue"
import { titleCase } from "#lib/core/names.js"
import { isMinecraftShape } from "#lib/geometry/shapes.js"
import { answerEula, eula } from "#lib/minecraft/eula.js"
import { jar, listVersions } from "#lib/minecraft/minecraft.js"
import { useModelPicture } from "#lib/panels/modelPicture.js"
import { setTexture } from "#lib/settings/textureDefaults.js"
import { isTitle } from "../elements.js"
import { library } from "../library.js"
import { edit } from "../undo.js"
import { TitleTile } from "./tile.js"

const EULA_KEY = "minecraft_title_generator"

function decline() {
  const usesTexture = settings => settings.textureSource === "tileable" && settings.tileableSource === "minecraft"
  const elements = Outliner.elements.filter(element => isTitle(element) && (usesTexture(element.settings) || isMinecraftShape(element.settings.shape)))
  if (!elements.length) return
  edit(elements, "Decline the Minecraft EULA", () => {
    for (const { settings } of elements) {
      if (usesTexture(settings)) setTexture(settings, { tileableSource: "premade", tileable: "checkerboard", tileableVariant: null })
      if (isMinecraftShape(settings.shape)) settings.shape = library.shapes[0].id
    }
  })
}

async function ask() {
  const agreed = await MinecraftEULA.promptUser(EULA_KEY)
  if (!agreed) decline()
  answerEula(agreed)
}

export function askEula() {
  return watch(() => eula.asking, asking => {
    if (asking) ask()
  })
}

export const DownloadProgress = {
  data: () => ({ jar }),
  template: `
    <div v-if="jar.version" class="mtg-field">
      <span class="mtg-hint">Downloading Minecraft {{ jar.version }}</span>
      <div class="mtg-progress"><div :style="{ width: (jar.total ? jar.done / jar.total * 100 : 0) + '%' }"></div></div>
    </div>
  `
}

export const VersionControl = {
  components: { DownloadProgress },
  props: { version: { type: String, default: null } },
  setup(props, { emit }) {
    const versions = shallowRef([])

    function item({ id }) {
      return { name: id, icon: id === props.version ? "far.fa-dot-circle" : "far.fa-circle", click: () => emit("pick", id) }
    }

    function choose() {
      const ofType = type => versions.value.filter(version => version.type === type).map(item)
      return ofType("release").concat("_", { name: "Snapshots", icon: "science", children: ofType("snapshot") })
    }

    listVersions().then(listed => (versions.value = listed.versions), err => Blockbench.showQuickMessage(`Could not load the Minecraft versions: ${err.message}`, 3000))

    return { choose }
  },
  template: `
    <div class="mtg-field">
      <select-input value="version" :options="{ version: { name: 'Minecraft ' + version } }" :custom_dropdown="choose" />
      <download-progress />
    </div>
  `
}

export const ModelTile = {
  components: { TitleTile },
  props: { kind: String, id: String, version: String, selected: Boolean },
  setup(props) {
    return { label: titleCase(props.id), ...useModelPicture(props) }
  },
  template: `<title-tile ref="tile" :label="label" :image="picture" aspect="1 / 1" :selected="selected" @pick="$emit('pick')" />`
}
