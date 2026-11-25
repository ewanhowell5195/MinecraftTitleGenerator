import { FORMAT } from "../format.js"
import { inTitleMode } from "../mode.js"
import { applyAngle, atAngle, isLocked, unlock } from "./angle.js"
import { inRenderMode } from "./mode.js"

const PRESSES = ["mousedown", "touchstart"]

const buttons = new Map()

function display(node, shown) {
  node.style.display = shown ? "" : "none"
}

function createTool(parent, press) {
  const icon = Interface.createElement("i", { class: "material-icons" })
  const node = Interface.createElement("div", { class: "tool" }, icon)
  BarItem.prototype.addLabel(false, { name: " ", node })
  const label = node.querySelector(".tooltip").firstChild
  node.addEventListener("click", press)
  parent.append(node)
  return {
    node,
    show(glyph, name) {
      icon.textContent = glyph
      label.textContent = name
    }
  }
}

function createButtons(shown) {
  const node = Interface.createElement("div", { class: "preview_menu mtg-lock" })
  const lock = createTool(node, () => isLocked(shown) ? unlock() : applyAngle(shown, true))
  const reset = createTool(node, () => applyAngle(shown, false))
  reset.show("replay", "Reset to the render angle")
  shown.node.append(node)
  const gizmo = shown.orbit_gizmo?.node
  let drawn = null

  function pressGizmo() {
    if (isLocked(shown)) unlock()
  }

  for (const type of PRESSES) gizmo?.addEventListener(type, pressGizmo, true)

  function update(used) {
    const locked = isLocked(shown)
    const lockable = used && inTitleMode()
    const away = used && !atAngle(shown)
    const state = [locked, lockable, away].join()
    if (state === drawn) return
    drawn = state
    lock.show(locked ? "lock" : "lock_open", locked ? "Unlock the view" : "Lock to the render angle")
    display(lock.node, lockable)
    display(reset.node, away)
    display(node, lockable || away)
  }

  function remove() {
    node.remove()
    for (const type of PRESSES) gizmo?.removeEventListener(type, pressGizmo, true)
  }

  return { update, remove }
}

export function lockDrawn({ preview: shown }) {
  if (!shown || shown.offscreen) return
  const used = Format?.id === FORMAT && !inRenderMode()
  if (used && !buttons.has(shown)) buttons.set(shown, createButtons(shown))
  buttons.get(shown)?.update(used)
}

export function removeLocks() {
  for (const button of buttons.values()) button.remove()
  buttons.clear()
}
