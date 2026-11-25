import { computed, onMounted, ref, watch } from "vue"
import { platform } from "#lib/core/platform.js"
import { NAME_LIMIT, confirmReplacing, confirmSharing, replaceTargets } from "#lib/presets/savedPresets.js"
import { useShareForm } from "#lib/presets/shareForm.js"
import { SHARE_INTRO, SHARING_AS, publishPreset, saveThenShare, useShareUsage, withoutAccountText } from "#lib/presets/sharing.js"
import { account, refreshAccount } from "#lib/state/account.js"
import { signIn } from "../account/index.js"
import { DropdownControl } from "../panels/inputs.js"
import { VotePrompt } from "./votePrompt.js"

export const published = ref(null)

let dialog = null
let closed = null

export const ShareUsage = {
  setup: () => useShareUsage(),
  template: `
    <div v-if="counted" class="mtg-usage" :class="{ full }" :title="text"><span class="mtg-pips"><i v-for="(left, index) of pips" :key="index" :class="{ left }"></i></span><span>{{ text }}</span></div>
  `
}

const ShareForm = {
  components: { DropdownControl, ShareUsage, VotePrompt },
  props: { code: String, suggested: String, preset: { type: Object, default: null } },
  setup(props) {
    const { name, error, sending, agreed, target, problem, blocked, replaceLabel, attempt } = useShareForm(() => props.code, () => props.suggested)
    const targets = computed(() => replaceTargets(props.code))
    const options = computed(() => [{ value: null, label: "New preset" }].concat(targets.value.map(({ code, name, shared }) => ({ value: code, label: shared ? `${name} (shared)` : name }))))
    const fresh = computed(() => !target.value?.online)
    const message = computed(() => error.value || problem.value)
    const label = computed(() => target.value?.online ? replaceLabel.value : sending.value ? "Sharing" : target.value ? "Replace and share" : "Share")

    async function publish() {
      const shared = await (props.preset ? publishPreset(props.preset, target.value, name.value) : saveThenShare(target.value, name.value))
      closeSharing()
      if (shared) published.value = shared
    }

    async function send() {
      if (blocked.value) return
      if (await (fresh.value ? confirmSharing(name.value.trim() || props.suggested) : confirmReplacing(target.value))) attempt(publish)
    }

    watch(targets, list => {
      if (target.value && !list.some(item => item.code === target.value.code)) target.value = null
    })
    onMounted(() => refreshAccount())

    return {
      account,
      agreed,
      blocked,
      cancel: closeSharing,
      choose: code => (target.value = targets.value.find(item => item.code === code) ?? null),
      fresh,
      intro: SHARE_INTRO,
      label,
      limit: NAME_LIMIT,
      loose: withoutAccountText(),
      message,
      name,
      openTerms: () => Blockbench.openLink(platform.asset("/terms/")),
      options,
      send,
      sharingAs: SHARING_AS,
      signIn,
      target
    }
  },
  mounted() {
    this.$refs.field.select()
  },
  template: `
    <div class="mtg-controls mtg-share">
      <vote-prompt v-if="!preset" />
      <dropdown-control v-if="options.length > 1" label="Share as" :value="target && target.code" :options="options" @change="choose" />
      <p v-if="!fresh" class="mtg-warning">This also replaces the shared version in Community, at the same link. Its votes, rating and uses are reset, and that cannot be undone.</p>
      <p v-else-if="target && target.shared" class="mtg-hint">Blockbench can't manage the shared version, so it will stay in Community as it is.</p>
      <div class="mtg-field">
        <label>Name</label>
        <input ref="field" type="text" class="dark_bordered mtg-text focusable_input" v-model="name" :maxlength="limit" :placeholder="target ? target.name : suggested" spellcheck="false" @keydown.enter="send">
      </div>
      <template v-if="fresh">
        <p v-if="!preset" class="mtg-hint">{{ intro }}</p>
        <p v-if="account">Sharing as <strong><i :class="'fab fa-' + account.provider"></i> {{ account.name }}</strong>. {{ sharingAs }}</p>
        <template v-else>
          <p v-for="line of loose" :key="line">{{ line }}</p>
          <button class="mtg-button" @click="signIn"><i class="material-icons">person</i><span>Sign in</span></button>
        </template>
      </template>
      <label class="mtg-agree"><input type="checkbox" v-model="agreed"><span>I agree to the <a @click.prevent="openTerms">Terms of Service</a></span></label>
      <p v-if="message" class="mtg-error">{{ message }}</p>
      <share-usage v-if="fresh" />
      <div class="mtg-row">
        <button class="mtg-button primary" :disabled="blocked" @click="send">{{ label }}</button>
        <button class="mtg-button" @click="cancel">Cancel</button>
      </div>
    </div>
  `
}

export function closeSharing() {
  const shut = closed
  closed = null
  dialog?.hide()
  dialog?.delete()
  dialog = null
  shut?.()
}

export function openSharing(props, onClose = null) {
  closeSharing()
  closed = onClose
  dialog = new Dialog("minecraft_title_share", {
    title: "Share publicly",
    width: 480,
    buttons: [],
    component: { components: { ShareForm }, data: () => ({ props }), template: `<share-form v-bind="props" />` },
    onConfirm: () => false,
    onCancel: closeSharing
  })
  dialog.show()
}
