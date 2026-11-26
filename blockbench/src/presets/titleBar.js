import { startSavingPreset } from "#lib/presets/savingPreset.js"
import { canSavePreset } from "./saving.js"

let button = null

export function titleBarChanged() {
  button.classList.toggle("hidden", !canSavePreset())
}

export function hideTitleBar() {
  button.classList.add("hidden")
}

export function registerTitleBar() {
  button = Interface.createElement("div", { class: "mtg-title-bar", title: "Save this title as a preset" })
  button.innerHTML = "<i class='material-icons'>bookmark</i><span>Save preset</span>"
  button.addEventListener("click", () => startSavingPreset())
  const next = Blockbench.isMobile ? MenuBar.mode_switcher_button : document.getElementById("windows_window_menu")
  next.before(button)
  titleBarChanged()
}

export function unregisterTitleBar() {
  button.remove()
  button = null
}
