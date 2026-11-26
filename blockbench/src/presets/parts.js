import { pictureUrl, previewAlt } from "#lib/core/pictures.js"
import { providerLabel } from "#lib/core/providers.js"
import { copyPresetLink, usePresetDetail } from "#lib/presets/presetDetail.js"
import { NAME_LIMIT } from "#lib/presets/savedPresets.js"
import { ratingText, toGoText, upvotedText, votesText } from "#lib/presets/presetText.js"

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

export const SavedTile = {
  components: { PresetPicture },
  props: { preset: Object, selected: Boolean, stats: Object },
  methods: { ratingText },
  template: `
    <div class="mtg-preset" :class="{ selected }" @click="$emit('pick')">
      <preset-picture :preset="preset" />
      <div class="mtg-row">
        <strong class="mtg-fill mtg-cut">{{ preset.name }}</strong>
        <span v-if="preset.inBrowser" class="mtg-mark" title="Your account is full, so this is only saved in Blockbench">Blockbench only</span>
        <template v-if="stats">
          <span class="mtg-uses" title="Uses"><i class="material-icons">download</i>{{ stats.downloads }}</span>
          <span v-if="stats.rating !== null" class="mtg-uses"><i class="material-icons mtg-gold">star</i>{{ ratingText(stats.rating) }}</span>
        </template>
      </div>
    </div>
  `
}

export const PresetDetail = {
  components: { PresetAuthor, PresetPicture, VoteButtons },
  props: { preset: Object, local: Boolean, stats: Object, searched: Boolean, mine: Boolean, owned: Boolean, saved: Boolean, blank: Boolean },
  setup(props, { emit }) {
    return usePresetDetail(props, name => emit("rename", name))
  },
  data: () => ({ stars: [1, 2, 3, 4, 5], limit: NAME_LIMIT }),
  computed: {
    pictured() {
      return this.local ? { code: this.preset.code, name: this.preset.name } : this.preset
    }
  },
  methods: {
    ratingText,
    toGoText,
    upvotedText,
    votesText,
    filled(star) {
      return { width: `${Math.min(Math.max(ratingText(this.figures.rating) - star + 1, 0), 1) * 100}%` }
    },
    async rename() {
      this.renaming = true
      await this.$nextTick()
      this.$refs.name.focus()
      this.$refs.name.select()
    },
    async copyLink() {
      Blockbench.showQuickMessage(await copyPresetLink(this.preset.id), 3000)
    }
  },
  template: `
    <div class="mtg-detail">
      <div class="mtg-close"><div class="tool" title="Close this preset" @click="$emit('close')"><i class="material-icons">close</i></div></div>
      <preset-picture :preset="pictured" />
      <div class="mtg-heading">
        <input v-if="renaming" ref="name" type="text" class="dark_bordered mtg-rename" :value="preset.name" :maxlength="limit" spellcheck="false" @blur="finishRenaming" @keydown.enter="$event.target.blur()" @keydown.esc.stop="renaming = false">
        <h2 v-else>{{ preset.name }}</h2>
        <div v-if="(local || owned) && !renaming" class="tool" :title="'Rename ' + preset.name" @click="rename"><i class="material-icons">edit</i></div>
        <span class="mtg-fill"></span>
        <span v-if="local && preset.inBrowser" class="mtg-mark" title="Your account is full, so this is only saved in Blockbench">Blockbench only</span>
        <span v-if="local && preset.shared" class="mtg-yours">Shared publicly</span>
        <span v-else-if="mine" class="mtg-yours">Shared by you</span>
      </div>
      <template v-if="figures">
        <vote-buttons v-if="!mine && !local" named :vote="preset.vote" @vote="$emit('vote', $event)" />
        <div v-if="figures.rating !== null" class="mtg-rating" :title="upvotedText(figures.rating)">
          <span class="mtg-stars"><span v-for="star of stars" :key="star" class="mtg-star"><i class="material-icons">star</i><i class="material-icons" :style="filled(star)">star</i></span></span>
          <strong>{{ ratingText(figures.rating) }}</strong>
          <span class="mtg-hint">{{ votesText(figures.votes) }}</span>
        </div>
        <p v-else class="mtg-hint">{{ toGoText(figures.votes) }}</p>
        <div class="mtg-facts mtg-hint">
          <span>{{ uses }}</span>
          <span>Shared {{ sharedOn }}</span>
          <span v-if="figures.author || !local && !mine" class="mtg-by">By <preset-author :preset="figures" :searched="searched" @user="(...user) => $emit('user', ...user)" /></span>
        </div>
      </template>
      <div class="mtg-actions">
        <button v-if="blank" class="mtg-button primary" @click="$emit('load')"><i class="material-icons">text_fields</i><span>Open preset</span></button>
        <template v-else>
          <button class="mtg-button primary" @click="$emit('open')"><i class="material-icons">add</i><span>Open preset as new project</span></button>
          <button class="mtg-button" @click="$emit('load')"><i class="material-icons">swap_horiz</i><span>Load preset into current project</span></button>
        </template>
        <template v-if="local">
          <button v-if="!preset.shared" class="mtg-button" @click="$emit('share')"><i class="material-icons">share</i><span>Share publicly</span></button>
          <button v-else class="mtg-button" @click="$emit('view')"><i class="material-icons">open_in_new</i><span>View in Community</span></button>
        </template>
        <template v-else>
          <button v-if="!mine" class="mtg-button" :disabled="saved" @click="$emit('save')"><i class="material-icons">bookmark</i><span>{{ saved ? "In My presets" : "Save to My presets" }}</span></button>
          <button class="mtg-button" @click="copyLink"><i class="material-icons">link</i><span>Copy link</span></button>
        </template>
        <button v-if="local || owned" class="mtg-button mtg-danger" @click="$emit('remove')"><i class="material-icons">delete</i><span>Delete</span></button>
      </div>
    </div>
  `
}
