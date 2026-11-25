import { platform } from "#lib/core/platform.js"
import { useSeen } from "#lib/panels/seen.js"
import { sortRows } from "./drag.js"
import { iconOf } from "./inputs.js"
import { ModelTile } from "./minecraft.js"
import { TitleTile } from "./tile.js"

export const TitleTiles = {
  components: { ModelTile, TitleTile },
  props: { control: Object, state: Object },
  setup() {
    return useSeen()
  },
  computed: {
    tiles() {
      return this.state.resolved(this.control.items)
    },
    more() {
      return this.state.resolved(this.control.more)
    },
    list() {
      const { columns, kept, patterns, rows, short } = this.control
      if (columns === 1) return "mtg-tiles"
      return ["mtg-grid mtg-scroll", { "mtg-short": short, "mtg-kept": this.state.resolved(kept), "mtg-variants": rows, "mtg-patterns": patterns }]
    },
    sizes() {
      const { least, rows } = this.control
      return { ...(least && { "--least": this.state.resolved(least) }), ...(rows && { "--rows": this.state.resolved(rows) }) }
    }
  },
  methods: {
    asset: path => platform.asset(path),
    watchSeen() {
      const tiles = new Map(this.tiles.map(tile => [tile.key, tile]))
      for (const element of this.$el.querySelectorAll("[data-sample]")) {
        const { sample } = tiles.get(element.dataset.sample)
        if (!sample.shown) this.observe(element, sample.seen)
      }
      this.observe(this.$refs.more, this.more?.seen)
    }
  },
  mounted() {
    this.watchSeen()
  },
  updated() {
    this.watchSeen()
  },
  beforeDestroy() {
    this.stop()
  },
  template: `
    <div :class="list" :style="sizes">
      <template v-for="tile of tiles">
        <div v-if="tile.layers" :key="tile.key" class="mtg-tile" :class="{ selected: tile.selected }" @click="$emit('pick', tile)">
          <span class="mtg-placement">
            <img v-for="layer of tile.layers" :key="layer.key" :src="asset(layer.image)" :class="{ dim: layer.dim }" alt="">
          </span>
          <span>{{ tile.label }}</span>
        </div>
        <model-tile v-else-if="tile.model" :key="tile.key" :kind="tile.model.kind" :id="tile.model.id" :version="tile.model.version" :selected="tile.selected" @pick="$emit('pick', tile)" />
        <title-tile v-else-if="tile.sample" :key="tile.key" :label="tile.label" :author="tile.author" :selected="tile.selected" @pick="$emit('pick', tile)">
          <span class="mtg-sample" :data-sample="tile.key"><span v-show="tile.sample.shown" :style="{ fontFamily: tile.sample.family }">ABC</span></span>
        </title-tile>
        <title-tile v-else :key="tile.key" :label="tile.label" :image="tile.image" :unit="tile.unit" :pattern="tile.pattern" :aspect="tile.aspect" :author="tile.author" :badge="tile.badge" :selected="tile.selected" @pick="$emit('pick', tile)" />
      </template>
      <div v-if="more" :key="'more-' + more.key" ref="more" class="mtg-more"></div>
    </div>
  `
}

export const LayerRows = {
  props: { control: Object, state: Object },
  computed: {
    items() {
      return this.state.resolved(this.control.items)
    }
  },
  methods: {
    asset: path => path && platform.asset(path),
    icon: iconOf,
    select(index) {
      this.control.select(index, this.state.context)
    },
    sort(event, from) {
      sortRows(event, this.$el, from, { move: (at, to) => this.$emit("move", at, to), end: () => this.$emit("done") })
    }
  },
  template: `
    <div class="mtg-rows">
      <div v-for="(item, index) of items" :key="item.key" class="mtg-layer" :class="{ selected: item.selected, off: item.off }" @click="select(index)">
        <i class="material-icons mtg-grip" @pointerdown="sort($event, index)">drag_handle</i>
        <img :src="asset(item.image)" alt="">
        <span class="mtg-fill">{{ item.label }}</span>
        <div v-for="action of item.actions" :key="action.title" class="tool" :title="action.title" @click.stop="$emit('act', action.press)"><i class="material-icons">{{ icon(action.icon) }}</i></div>
      </div>
    </div>
  `
}

export const PairControl = {
  props: { control: Object },
  methods: {
    write(side, event) {
      side.write(event.target.value)
      event.target.value = side.read()
    }
  },
  template: `
    <div class="mtg-field">
      <label>{{ control.label }}</label>
      <div class="mtg-row">
        <template v-for="(side, index) of control.sides">
          <span v-if="index" :key="'between-' + index" class="mtg-hint">{{ control.between }}</span>
          <input :key="side.label" type="number" class="dark_bordered mtg-fill" min="1" :max="side.max()" :value="side.read()" @change="write(side, $event)">
        </template>
        <div v-if="control.link" class="tool" :class="{ enabled: control.link.read() }" :title="control.link.title" @click="control.link.toggle()"><i class="material-icons">link</i></div>
      </div>
    </div>
  `
}

const UploadControl = {
  props: { accept: String, label: String, empty: String, image: { type: String, default: null }, preview: { type: Object, default: null }, disabled: Boolean, multiple: Boolean, clearable: Boolean, back: Boolean },
  methods: {
    choose(event) {
      const files = Array.from(event.target.files)
      event.target.value = ""
      if (files.length) this.$emit("files", files)
    }
  },
  template: `
    <div class="mtg-upload">
      <template v-if="preview">
        <img v-if="preview.image" :src="preview.image" alt="" :style="preview.unit ? { height: preview.unit + 'px' } : null">
        <span>{{ preview.name }}</span>
      </template>
      <img v-else-if="image" :src="image" alt="">
      <span v-else class="mtg-hint">{{ empty }}</span>
      <div class="mtg-row">
        <label class="mtg-button mtg-fill" :class="{ disabled }"><input type="file" :accept="accept" :multiple="multiple" :disabled="disabled" @change="choose"><i class="material-icons">folder_open</i><span>{{ label }}</span></label>
        <div v-if="clearable" class="tool" title="Remove" @click="$emit('clear')"><i class="material-icons">delete</i></div>
      </div>
    </div>
  `
}

const ReuseTiles = {
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

export const TILES = { UploadControl, ReuseTiles }
