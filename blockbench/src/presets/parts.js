import { platform } from "#lib/core/platform.js"
import { pictureUrl, previewAlt } from "#lib/core/pictures.js"
import { providerLabel } from "#lib/core/providers.js"
import { presetPath } from "#lib/presets/presetPath.js"
import { ratingText, sharedText, toGoText, upvotedText, usesText, votesText } from "#lib/presets/presetText.js"

const PresetPicture = {
  props: { preset: Object },
  data: () => ({ loaded: false, failed: false }),
  computed: {
    source() {
      return pictureUrl(this.preset)
    },
    alt() {
      return previewAlt(this.preset.name)
    }
  },
  watch: {
    source() {
      this.loaded = false
      this.failed = false
    }
  },
  template: `
    <div class="mtg-picture mtg-checker">
      <img v-if="!failed" :class="{ waiting: !loaded }" loading="lazy" :src="source" :alt="alt" @load="loaded = true" @error="failed = true">
      <span v-if="failed" class="mtg-hint">Can't show this title</span>
      <span v-else-if="!loaded" class="mtg-hint">Loading</span>
    </div>
  `
}

const PresetAuthor = {
  props: { preset: Object, searched: Boolean, yours: Boolean },
  computed: {
    title() {
      const { author, authorProvider } = this.preset
      return this.searched ? null : `Show presets by ${author} on ${providerLabel(authorProvider)}`
    }
  },
  template: `
    <span v-if="preset.author" class="mtg-author mtg-link" :class="{ yours }" :title="title" @click.stop="$emit('user', preset.author, preset.authorProvider)"><i :class="'fab fa-' + preset.authorProvider"></i><span>{{ preset.author }}</span></span>
    <span v-else class="mtg-author"><i class="material-icons">groups</i><span>Community</span></span>
  `
}

const VoteButtons = {
  props: { vote: Number, named: Boolean },
  computed: {
    up() {
      return this.vote === 1 ? "Upvoted" : "Upvote"
    },
    down() {
      return this.vote === -1 ? "Downvoted" : "Downvote"
    }
  },
  template: `
    <div class="mtg-votes" :class="{ named }" @click.stop>
      <button class="mtg-button" :class="{ voted: vote === 1 }" :title="up" @click="$emit('vote', 1)"><i class="material-icons">arrow_upward</i><span v-if="named">{{ up }}</span></button>
      <button class="mtg-button" :class="{ voted: vote === -1, negative: vote === -1 }" :title="down" @click="$emit('vote', -1)"><i class="material-icons">arrow_downward</i><span v-if="named">{{ down }}</span></button>
    </div>
  `
}

export const PresetTile = {
  components: { PresetAuthor, PresetPicture, VoteButtons },
  props: { preset: Object, selected: Boolean, searched: Boolean, mine: Boolean },
  methods: { ratingText, toGoText, votesText },
  template: `
    <div class="mtg-preset" :class="{ selected }" @click="$emit('pick')">
      <preset-picture :preset="preset" />
      <div class="mtg-row">
        <div class="mtg-about">
          <strong>{{ preset.name }}</strong>
          <span v-if="mine && !preset.author" class="mtg-yours">Shared by you</span>
          <preset-author v-else :preset="preset" :searched="searched" :yours="mine" @user="(...user) => $emit('user', ...user)" />
        </div>
        <span v-if="preset.rating !== null" class="mtg-rating" :title="votesText(preset.votes)"><i class="material-icons">star</i>{{ ratingText(preset.rating) }}</span>
        <span v-else class="mtg-needs" :title="toGoText(preset.votes)">Needs votes</span>
        <vote-buttons v-if="!mine" :vote="preset.vote" @vote="$emit('vote', $event)" />
      </div>
    </div>
  `
}

export const PresetDetail = {
  components: { PresetAuthor, PresetPicture, VoteButtons },
  props: { preset: Object, searched: Boolean, mine: Boolean, blank: Boolean },
  data: () => ({ stars: [1, 2, 3, 4, 5] }),
  methods: {
    ratingText,
    sharedText,
    toGoText,
    upvotedText,
    usesText,
    votesText,
    filled(star) {
      return { width: `${Math.min(Math.max(ratingText(this.preset.rating) - star + 1, 0), 1) * 100}%` }
    },
    async copyLink() {
      try {
        await navigator.clipboard.writeText(platform.asset(presetPath(this.preset.id)))
        Blockbench.showQuickMessage("Link copied")
      } catch (err) {
        Blockbench.showQuickMessage(`Could not copy: ${err.message}`, 3000)
      }
    }
  },
  template: `
    <div class="mtg-detail">
      <div class="mtg-close"><div class="tool" title="Close this preset" @click="$emit('close')"><i class="material-icons">close</i></div></div>
      <preset-picture :preset="preset" />
      <div class="mtg-heading"><h2>{{ preset.name }}</h2><span v-if="mine" class="mtg-yours">Shared by you</span></div>
      <vote-buttons v-if="!mine" named :vote="preset.vote" @vote="$emit('vote', $event)" />
      <div v-if="preset.rating !== null" class="mtg-rating" :title="upvotedText(preset.rating)">
        <span class="mtg-stars"><span v-for="star of stars" :key="star" class="mtg-star"><i class="material-icons">star</i><i class="material-icons" :style="filled(star)">star</i></span></span>
        <strong>{{ ratingText(preset.rating) }}</strong>
        <span class="mtg-hint">{{ votesText(preset.votes) }}</span>
      </div>
      <p v-else class="mtg-hint">{{ toGoText(preset.votes) }}</p>
      <div class="mtg-facts mtg-hint">
        <span>{{ usesText(preset) }}</span>
        <span>Shared {{ sharedText(preset.createdAt) }}</span>
        <span v-if="preset.author || !mine" class="mtg-by">By <preset-author :preset="preset" :searched="searched" @user="(...user) => $emit('user', ...user)" /></span>
      </div>
      <div class="mtg-actions">
        <button v-if="blank" class="mtg-button primary" @click="$emit('load')"><i class="material-icons">text_fields</i><span>Open preset</span></button>
        <template v-else>
          <button class="mtg-button primary" @click="$emit('open')"><i class="material-icons">add</i><span>Open preset as new project</span></button>
          <button class="mtg-button" @click="$emit('load')"><i class="material-icons">swap_horiz</i><span>Load preset into existing project</span></button>
        </template>
        <button class="mtg-button" @click="copyLink"><i class="material-icons">link</i><span>Copy link</span></button>
      </div>
    </div>
  `
}
