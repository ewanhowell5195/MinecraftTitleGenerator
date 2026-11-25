import { watch } from "vue"
import { platform } from "#lib/core/platform.js"
import { sharingProblem } from "#lib/link/shareChecks.js"
import { NAME_LIMIT, confirmReplacing, replaceTargets } from "#lib/presets/savedPresets.js"
import { namingCode, namingPreset, namingShared, saveOver, savePreset, startSavingPreset, usePresetTitle } from "#lib/presets/savingPreset.js"
import { presetToAsk } from "#lib/state/community.js"
import { fileError } from "#lib/state/notices.js"
import { hasTitles, isCased, sourcePreset, titleFileData, titleText } from "../file.js"
import { FORMAT } from "../format.js"
import { sendStats } from "../stats.js"
import { VotePrompt } from "./votePrompt.js"

let action = null
let dialog = null
let stopNaming = null

function closeForm() {
  dialog?.hide()
  dialog?.delete()
  dialog = null
}

function openForm(suggested) {
  const targets = namingShared.value ? [] : replaceTargets(namingCode.value)
  const targetOf = form => targets[Number(form.target?.slice(1))]
  let saving = false
  let chosen = null

  async function save(form) {
    const target = targetOf(form)
    if (!target) return savePreset(form.name)
    const problem = target.online && (sharingProblem(namingCode.value, form.name.trim() || target.name) ?? (form.agreed ? null : "You need to agree to the Terms of Service to replace a shared title."))
    if (problem) return (fileError.value = problem)
    if (!await confirmReplacing(target)) return
    try {
      await saveOver(target, form.name)
      namingPreset.value = null
    } catch (err) {
      fileError.value = err.message
    }
  }

  const form = {}
  if (targets.length) form.target = { type: "select", label: "Save as", value: "new", options: Object.fromEntries([["new", "New preset"]].concat(targets.map(({ name, shared }, index) => [`t${index}`, shared ? `${name} (shared)` : name]))) }
  form.name = { type: "text", label: "Name", value: suggested, placeholder: suggested }
  if (targets.some(target => target.online)) {
    form.replaces = { type: "info", text: `This also replaces the shared version in Community, at the same link. Its votes, rating and uses are reset, and that cannot be undone. Replacing it means agreeing to the [Terms of Service](${platform.asset("/terms/")}).`, condition: form => !!targetOf(form)?.online }
    form.agreed = { type: "checkbox", label: "I agree", condition: form => !!targetOf(form)?.online }
  }
  if (targets.some(target => target.shared && !target.online)) form.stays = { type: "info", text: "Blockbench can't manage the shared version, so it will stay in Community as it is.", condition: form => !!targetOf(form)?.shared && !targetOf(form).online }

  dialog = new Dialog("minecraft_title_save_preset", {
    title: "Save preset",
    width: 460,
    form,
    part_order: ["component", "form"],
    component: presetToAsk(sourcePreset()) ? VotePrompt : undefined,
    buttons: ["dialog.save", "dialog.cancel"],
    cancel_on_click_outside: false,
    onFormChange(result) {
      const target = targetOf(result) ?? null
      if (target === chosen) return
      chosen = target
      dialog.setFormValues({ name: target?.name ?? suggested }, false)
    },
    onConfirm(result) {
      if (!saving) {
        saving = true
        save(result).finally(() => (saving = false))
      }
      return false
    },
    onCancel: () => (namingPreset.value = null),
    onOpen() {
      const { input } = dialog.form.form_data.name
      input.maxLength = NAME_LIMIT
      input.select()
    }
  })
  dialog.show()
}

function followNaming(name) {
  closeForm()
  if (name !== null) openForm(name)
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
