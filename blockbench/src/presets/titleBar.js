import { startSavingPreset } from "#lib/presets/savingPreset.js"
import { canSavePreset } from "./saving.js"

let button = null

function openMenu() {
  new Menu([
    { name: "Save preset", icon: "bookmark", click: () => startSavingPreset() },
    { name: "Share publicly", icon: "share", click: () => startSavingPreset({ share: true }) }
  ]).open(button)
}

export function titleBarChanged() {
  button.classList.toggle("hidden", !canSavePreset())
}

export function hideTitleBar() {
  button.classList.add("hidden")
}

export function registerTitleBar() {
  button = Interface.createElement("div", { class: "mtg-title-bar", title: "Save or share this title" })
  button.innerHTML = "<i class='material-icons'>bookmark</i><span>Save or share</span><i class='material-icons'>arrow_drop_down</i>"
  button.addEventListener("click", openMenu)
  const next = Blockbench.isMobile ? MenuBar.mode_switcher_button : document.getElementById("windows_window_menu")
  next.before(button)
  titleBarChanged()
}

export function unregisterTitleBar() {
  button.remove()
  button = null
}
