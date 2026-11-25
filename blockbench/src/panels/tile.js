import { authorText } from "#lib/core/authors.js"
import { platform } from "#lib/core/platform.js"

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
