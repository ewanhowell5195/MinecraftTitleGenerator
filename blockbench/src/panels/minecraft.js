import { shallowRef, watch } from "vue"
import { titleCase } from "#lib/core/names.js"
import { isMinecraftShape } from "#lib/geometry/shapes.js"
import { EULA_URL, answerEula, eula } from "#lib/minecraft/eula.js"
import { jar, listVersions } from "#lib/minecraft/minecraft.js"
import { useModelPicture } from "#lib/panels/modelPicture.js"
import { setTexture } from "#lib/settings/textureDefaults.js"
import { isTitle } from "../elements.js"
import { library } from "../library.js"
import { edit } from "../undo.js"
import { TitleTile } from "./tile.js"

const AGREEMENT = `you need to agree to the [Minecraft End User License Agreement (EULA)](${EULA_URL}).`
const QUESTIONS = {
  shapes: `The Minecraft shapes are the game's own block and item models, downloaded straight from Mojang. To use them, ${AGREEMENT}\n\nChoosing No keeps you on the premade shapes.`,
  tileables: `The Minecraft textures in Tileables are the game's own block textures, downloaded straight from Mojang. To use them, ${AGREEMENT}\n\nChoosing No uses the premade checkerboard instead, and Tileables will open on Premade from now on.`
}

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

function ask() {
  Blockbench.showMessageBox({ title: "Minecraft EULA", message: QUESTIONS[eula.reason], buttons: ["I agree", "No"], confirm: 0, cancel: 1 }, answer => {
    if (answer !== 0) decline()
    answerEula(answer === 0)
  })
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
