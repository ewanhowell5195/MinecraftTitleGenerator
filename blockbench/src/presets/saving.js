import { computed, watch } from "vue"
import { platform } from "#lib/core/platform.js"
import { NAME_LIMIT, confirmReplacing, replaceTargets } from "#lib/presets/savedPresets.js"
import { namingCode, namingPreset, namingShared, saveOver, savePreset, startSavingPreset, usePresetTitle } from "#lib/presets/savingPreset.js"
import { useShareForm } from "#lib/presets/shareForm.js"
import { hasTitles, isCased, titleFileData, titleText } from "../file.js"
import { FORMAT } from "../format.js"
import { DropdownControl } from "../panels/inputs.js"
import { sendStats } from "../stats.js"
import { VotePrompt } from "./votePrompt.js"

let action = null
let dialog = null
let stopNaming = null

const SaveForm = {
  components: { DropdownControl, VotePrompt },
  setup() {
    const suggested = namingPreset.value
    const { name, error, sending, agreed, target, problem, blocked, replaceLabel, attempt } = useShareForm(() => namingCode.value, () => suggested)
    const targets = namingShared.value ? [] : replaceTargets(namingCode.value)
    const options = [{ value: null, label: "New preset" }].concat(targets.map(({ code, name, shared }) => ({ value: code, label: shared ? `${name} (shared)` : name })))
    const refused = computed(() => !!target.value?.online && blocked.value)
    const message = computed(() => error.value || target.value?.online && problem.value)

    async function replace() {
      await saveOver(target.value, name.value)
      namingPreset.value = null
    }

    async function save() {
      if (sending.value || refused.value) return
      if (!target.value) savePreset(name.value)
      else if (await confirmReplacing(target.value)) attempt(replace)
    }

    return {
      name,
      sending,
      agreed,
      target,
      replaceLabel,
      suggested,
      options,
      refused,
      message,
      save,
      limit: NAME_LIMIT,
      choose: code => (target.value = targets.find(item => item.code === code) ?? null),
      openTerms: () => Blockbench.openLink(platform.asset("/terms/"))
    }
  },
  mounted() {
    this.$refs.field.select()
  },
  template: `
    <div class="mtg-controls">
      <vote-prompt />
      <dropdown-control v-if="options.length > 1" label="Save as" :value="target && target.code" :options="options" @change="choose" />
      <p v-if="target && target.online" class="mtg-warning">This also replaces the shared version in Community, at the same link. Its votes, rating and uses are reset, and that cannot be undone.</p>
      <p v-else-if="target && target.shared" class="mtg-hint">Blockbench can't manage the shared version, so it will stay in Community as it is.</p>
      <div class="mtg-field">
        <label>Name</label>
        <input ref="field" type="text" class="dark_bordered mtg-text focusable_input" v-model="name" :maxlength="limit" :placeholder="target ? target.name : suggested" spellcheck="false" @keydown.enter="save">
      </div>
      <label v-if="target && target.online" class="mtg-agree"><input type="checkbox" v-model="agreed"><span>I agree to the <a @click.prevent="openTerms">Terms of Service</a></span></label>
      <p v-if="message" class="mtg-error">{{ message }}</p>
      <button class="mtg-button primary" :disabled="sending || refused" @click="save">{{ target ? replaceLabel : "Save" }}</button>
    </div>
  `
}

function closeForm() {
  dialog?.hide()
  dialog?.delete()
  dialog = null
}

function followNaming(name) {
  closeForm()
  if (name === null) return
  dialog = new Dialog("minecraft_title_save_preset", {
    title: "Save preset",
    width: 460,
    buttons: [],
    cancel_on_click_outside: false,
    component: { components: { SaveForm }, template: "<save-form />" },
    onCancel: () => (namingPreset.value = null),
    onButton: () => (namingPreset.value = null)
  })
  dialog.show()
}

export function canSavePreset() {
  return !!Project && Format.id === FORMAT && hasTitles()
}

export function registerSaving() {
  usePresetTitle({ data: titleFileData, text: titleText, cased: isCased, submitStats: () => sendStats(Project) })
  stopNaming = watch(namingPreset, followNaming)
  action = new Action("save_minecraft_title_preset", { name: "Save Title Preset", icon: "bookmark", category: "file", condition: canSavePreset, click: () => startSavingPreset() })
  MenuBar.menus.file.addAction(action, "#project")
}

export function unregisterSaving() {
  namingPreset.value = null
  closeForm()
  stopNaming()
  MenuBar.menus.file.removeAction(action)
  action.delete()
}
