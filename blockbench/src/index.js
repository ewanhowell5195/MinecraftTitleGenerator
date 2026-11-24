import { addText, registerActions, unregisterActions } from "./actions.js"
import { isTitle, registerElements, unregisterElements } from "./elements.js"
import { registerFormat, unregisterFormat } from "./format.js"
import { followSelection, registerHost, selected } from "./host.js"
import { openLibrary } from "./library.js"
import { openTitleMode, registerMode, unregisterMode } from "./mode.js"
import { registerPanels, unregisterPanels } from "./panels/index.js"
import { askEula } from "./panels/minecraft.js"
import { useBlockbench } from "./platform.js"
import { closeTitle, closeTitles, refreshList, sortTitle, titleState } from "./titles.js"

const listeners = []

function listen(event, action) {
  Blockbench.on(event, action)
  listeners.push([event, action])
}

function refresh() {
  if (Project) refreshList(titleState())
}

let drawn = null
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
    registerMode()
    registerActions()
    registerHost()
    registerPanels()
    stopAsking = askEula()
    for (const event of ["finished_edit", "undo", "redo", "load_project", "select_project"]) listen(event, refresh)
    for (const event of ["update_selection", "select_project", "unselect_project"]) listen(event, followSelection)
    listen("load_project", () => setTimeout(() => Project && Outliner.elements.some(isTitle) && openTitleMode()))
    listen("close_project", () => Project && closeTitle(Project))
    drawn = scene.onBeforeRender
    scene.onBeforeRender = (renderer, shown, camera, ...rest) => {
      drawn?.(renderer, shown, camera, ...rest)
      sortTitle(camera)
    }
  },
  onunload() {
    scene.onBeforeRender = drawn
    stopAsking()
    for (const [event, action] of listeners.splice(0)) Blockbench.removeListener(event, action)
    selected.value = null
    unregisterPanels()
    unregisterMode()
    closeTitles()
    unregisterActions()
    unregisterFormat()
    unregisterElements()
  }
})
