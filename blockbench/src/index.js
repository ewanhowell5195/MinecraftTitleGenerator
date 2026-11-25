import { addText, registerActions, unregisterActions } from "./actions.js"
import { chooseClicked } from "./clicks.js"
import { isTitle, registerElements, unregisterElements } from "./elements.js"
import { registerFile, unregisterFile } from "./file.js"
import { registerFormat, unregisterFormat } from "./format.js"
import { followSelection, registerHost, selected } from "./host.js"
import { openLibrary } from "./library.js"
import { followElementTab, openTitleMode, registerMode, unregisterMode } from "./mode.js"
import { registerPanels, unregisterPanels } from "./panels/index.js"
import { askEula } from "./panels/minecraft.js"
import { registerRenderMode, unregisterRenderMode } from "./render/mode.js"
import { angleClosed, angleDrawn, angleMoved, placeLater, registerAngle, unregisterAngle } from "./render/angle.js"
import { lockDrawn, removeLocks } from "./render/lock.js"
import { viewChanged, viewDrawn, viewTurned } from "./render/view.js"
import { hidePresets, presetsChanged, registerPresets, unregisterPresets } from "./presets/index.js"
import { registerPasses, unregisterPasses } from "./passes.js"
import { useBlockbench } from "./platform.js"
import { keepCounted, registerStats, savedStats, unregisterStats } from "./stats.js"
import { closeTitle, closeTitles, resort, settleTitle, sortTitle } from "./titles.js"
import { keepTitle, loadTitle } from "./undo.js"

const listeners = []

function listen(event, action) {
  Blockbench.on(event, action)
  listeners.push([event, action])
}

function refresh() {
  if (Project) settleTitle()
  resort()
  viewChanged()
  presetsChanged()
}

let drawn = null
let finished = null
let stopAsking = null

Plugin.register("minecraft_title_generator", {
  title: "Minecraft Title Generator",
  icon: "icon.png",
  author: "Ewan Howell",
  description: "Create Minecraft-styled title text in Blockbench!",
  tags: ["Minecraft", "Title", "Logo"],
  version: "2.0.0",
  min_version: "5.2.0",
  variant: "both",
  contributes: { formats: ["minecraft_title"] },
  website: "https://mctitlegenerator.com/",
  repository: "https://github.com/ewanhowell5195/MinecraftTitleGenerator",
  bug_tracker: "https://github.com/ewanhowell5195/MinecraftTitleGenerator/issues",
  onload() {
    useBlockbench()
    openLibrary()
    registerElements()
    registerFormat({
      onNew() {
        openTitleMode()
        addText("Minecraft")
      }
    })
    registerFile()
    registerMode()
    registerPresets()
    registerActions()
    registerHost()
    registerStats()
    registerPasses()
    registerRenderMode()
    registerAngle()
    registerPanels()
    stopAsking = askEula()
    for (const event of ["finished_edit", "undo", "redo", "load_project", "merge_project", "select_project"]) listen(event, refresh)
    for (const event of ["update_selection", "select_project", "unselect_project"]) listen(event, followSelection)
    Codecs.project.on("parsed", refresh)
    listen("update_selection", followElementTab)
    for (const event of ["new_project", "setup_project"]) listen(event, placeLater)
    listen("canvas_select", chooseClicked)
    listen("update_camera_position", viewTurned)
    listen("update_camera_position", angleMoved)
    listen("unselect_project", angleClosed)
    listen("unselect_project", hidePresets)
    listen("create_undo_save", keepTitle)
    listen("load_undo_save", loadTitle)
    listen("load_project", () => setTimeout(() => Project && Outliner.elements.some(isTitle) && openTitleMode()))
    listen("close_project", () => Project && closeTitle(Project))
    listen("saved_state_changed", savedStats)
    listen("save_project", keepCounted)
    drawn = scene.onBeforeRender
    scene.onBeforeRender = (renderer, shown, camera, ...rest) => {
      drawn?.(renderer, shown, camera, ...rest)
      sortTitle(camera)
    }
    finished = scene.onAfterRender
    scene.onAfterRender = (renderer, shown, camera, ...rest) => {
      finished?.(renderer, shown, camera, ...rest)
      viewDrawn(camera)
      angleDrawn(camera)
      lockDrawn(camera)
    }
  },
  onunload() {
    scene.onBeforeRender = drawn
    scene.onAfterRender = finished
    stopAsking()
    for (const [event, action] of listeners.splice(0)) Blockbench.removeListener(event, action)
    selected.value = null
    Codecs.project.removeListener("parsed", refresh)
    unregisterRenderMode()
    unregisterAngle()
    removeLocks()
    unregisterPanels()
    unregisterPresets()
    unregisterMode()
    unregisterFile()
    closeTitles()
    unregisterActions()
    unregisterFormat()
    unregisterStats()
    unregisterPasses()
    unregisterElements()
  }
})
