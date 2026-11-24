import { applyType } from "../../src/lib/settings/defaults.js"
import { freeRowOf } from "../../src/lib/title/title.js"
import { convert, isCubes } from "./convert/index.js"
import { FORMAT } from "./format.js"
import { library } from "./library.js"
import { titleState } from "./titles.js"
import { isTitle, types } from "./elements.js"
import { addWord, homeElement } from "./words.js"

const actions = []
const converters = []

function startAt(settings) {
  const { title } = titleState()
  const others = title.objects.filter(object => object !== settings)
  const type = others.at(-1)?.type ?? "top"
  if (type !== settings.type) {
    settings.type = type
    applyType(settings, type)
  }
  settings.row = freeRowOf(type, title, [settings])
}

function addElement(type, values, label) {
  Undo.initEdit({ outliner: true, elements: [], selection: true })
  const element = new type({ title: values, title_version: undefined })
  Object.assign(element.settings, values)
  startAt(element.settings)
  element.name = element.describe() || "title"
  element.addTo(getCurrentGroup()).init()
  unselectAllElements()
  element.select()
  Undo.finishEdit(label, { outliner: true, elements: [element], selection: true })
  return element
}

function like(keys, wanted) {
  const element = Outliner.selected.find(isTitle)
  const selected = element && (element.words[0] ?? element).settings
  return selected && wanted(selected) ? Object.fromEntries(keys.map(key => [key, selected[key]])) : {}
}

export function addText(text = "text") {
  return addElement(types.text, { ...like(["font", "customFont"], settings => settings.shape === null), text }, "Add title text")
}

export function addShape() {
  return addElement(types.shape, { shape: library.shapes[0]?.id ?? "heart", ...like(["shape", "shapeVersion", "blockState", "itemComponents"], settings => settings.shape !== null) }, "Add title shape")
}

function selectedTitles() {
  return Array.from(new Set(Outliner.selected.filter(isTitle).map(homeElement)))
}

function wordTarget() {
  const titles = selectedTitles()
  return titles.length === 1 && titles[0] instanceof types.text ? titles[0] : null
}

async function convertSelected(kind) {
  try {
    await convert(selectedTitles(), kind)
  } catch (err) {
    Blockbench.showMessageBox({ title: "Couldn't convert the title", message: err.message })
    console.error(err)
  }
}

export function registerActions() {
  const condition = { modes: ["edit"], formats: [FORMAT] }
  actions.push(
    new Action("add_minecraft_title_text", { name: "Add Minecraft Title Text", icon: "text_fields", category: "edit", condition, click: () => addText() }),
    new Action("add_minecraft_title_shape", { name: "Add Minecraft Title Shape", icon: "interests", category: "edit", condition, click: () => addShape() })
  )
  converters.push(
    new Action("add_minecraft_title_word", { name: "Add Word", icon: "match_word", category: "edit", condition: () => !!wordTarget(), click: () => addWord(wordTarget()) }),
    new Action("convert_minecraft_title_to_cubes", { name: "Convert to Cubes", icon: "view_in_ar", category: "edit", condition: () => selectedTitles().length > 0 && selectedTitles().every(isCubes), click: () => convertSelected("cubes") }),
    new Action("convert_minecraft_title_to_mesh", { name: "Convert to Mesh", icon: "fa-gem", category: "edit", condition: () => selectedTitles().length > 0, click: () => convertSelected("mesh") })
  )
  BarItems.add_element.side_menu.structure.unshift(...actions.map(action => action.id))
  for (const action of actions.toReversed()) {
    Toolbars.outliner.add(action, 0)
    MenuBar.menus.edit.addAction(action, 5)
  }
}

export function unregisterActions() {
  for (const action of actions) {
    BarItems.add_element.side_menu.structure.remove(action.id)
    Toolbars.outliner.remove(action)
    MenuBar.menus.edit.removeAction(action)
    action.delete()
  }
  for (const action of converters) action.delete()
  actions.length = 0
  converters.length = 0
}
