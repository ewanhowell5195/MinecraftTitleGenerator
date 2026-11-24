import { authorText } from "../../../src/lib/core/authors.js"
import { readDataUrl } from "../../../src/lib/core/files.js"
import { platform } from "../../../src/lib/core/platform.js"
import { loadImage } from "../../../src/lib/font/font.js"
import { surface } from "../../../src/lib/texture/canvas.js"

const KEPT_TYPES = ["image/png", "image/jpeg"]

async function asPng(file) {
  const url = URL.createObjectURL(file)
  try {
    const loaded = await loadImage(url)
    const { canvas, ctx } = surface(loaded.width, loaded.height)
    ctx.drawImage(loaded, 0, 0)
    return await new Promise(resolve => canvas.toBlob(resolve, "image/png"))
  } catch {
    throw new Error(`Couldn't open ${file.name}: it can't be read as an image`)
  } finally {
    URL.revokeObjectURL(url)
  }
}

export async function readImage([file], apply) {
  try {
    readDataUrl(KEPT_TYPES.includes(file.type) ? file : await asPng(file), apply)
  } catch (err) {
    Blockbench.showQuickMessage(err.message, 3000)
  }
}

export const TitleTile = {
  props: { label: String, image: { type: String, default: null }, unit: { type: Number, default: null }, pattern: { type: String, default: null }, aspect: { type: String, default: "288 / 132" }, author: { type: [String, Array], default: null }, badge: { type: Number, default: 0 }, selected: Boolean },
  computed: {
    credit() {
      return this.author ? `By ${authorText(this.author)}` : null
    },
    source() {
      return this.image && platform.asset(this.image)
    },
    thumb() {
      return { aspectRatio: this.aspect, ...(this.pattern && { backgroundImage: `url("${platform.asset(this.pattern)}")` }) }
    }
  },
  template: `
    <div class="mtg-tile" :class="{ selected }" :title="credit" @click="$emit('pick')">
      <div class="mtg-thumb" :class="{ pattern }" :style="thumb"><slot><img v-if="source" :src="source" loading="lazy" alt="" :style="unit ? { height: unit + 'px' } : null"></slot></div>
      <span class="mtg-name">{{ label }}</span>
      <span v-if="badge" class="mtg-badge" :title="badge + ' variants'">{{ badge }}</span>
    </div>
  `
}

export const UploadControl = {
  props: { accept: String, label: String, empty: String, image: { type: String, default: null }, disabled: Boolean, multiple: Boolean, clearable: Boolean },
  methods: {
    choose(event) {
      const files = Array.from(event.target.files)
      event.target.value = ""
      if (files.length) this.$emit("files", files)
    }
  },
  template: `
    <div class="mtg-upload">
      <slot>
        <img v-if="image" :src="image" alt="">
        <span v-else class="mtg-hint">{{ empty }}</span>
      </slot>
      <div class="mtg-row">
        <label class="mtg-button mtg-fill" :class="{ disabled }"><input type="file" :accept="accept" :multiple="multiple" :disabled="disabled" @change="choose"><i class="material-icons">folder_open</i><span>{{ label }}</span></label>
        <div v-if="clearable" class="tool" title="Remove" @click="$emit('clear')"><i class="material-icons">delete</i></div>
      </div>
    </div>
  `
}

export const ReuseTiles = {
  components: { TitleTile },
  props: { items: Array },
  template: `
    <div v-if="items.length" class="mtg-controls">
      <h4>Used elsewhere in this title</h4>
      <div class="mtg-grid">
        <title-tile v-for="item of items" :key="item.key" :label="item.label" :image="item.image" @pick="$emit('pick', item.value)" />
      </div>
    </div>
  `
}

export const TILES = { TitleTile, UploadControl, ReuseTiles }
