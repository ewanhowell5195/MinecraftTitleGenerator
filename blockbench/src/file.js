import * as THREE from "three"
import { fileNameOf } from "#lib/core/files.js"
import { round } from "#lib/core/maths.js"
import { openableTitle } from "#lib/link/linkformat.js"
import { joinWords, titleValues } from "#lib/link/titleLines.js"
import { setCamera } from "#lib/settings/camera.js"
import { isDefaultTitle } from "#lib/title/defaultTitle.js"
import { EXTENSION, fileData, presetSource, readTitle, trimUnused } from "#lib/title/titleData.js"
import { isTitle, types } from "./elements.js"
import { FORMAT } from "./format.js"
import { openTitleMode } from "./mode.js"
import { lineTransform, nativeLine, nativePosition, nativeTurn, nativeWordRotation } from "./placing.js"
import { countedInFile, restoreCounted } from "./stats.js"
import { lineOf, memberOf, runtimeOf, settleTitle, titleState } from "./titles.js"
import { KEPT, WHOLE, finishEdit, quietly } from "./undo.js"
import { familyOf, homeElement } from "./words.js"

const LINE_MOVES = keysOf("translate", "rotation")
const MOVES = LINE_MOVES.concat(keysOf("wordTranslate", "wordRotation"))
const UNPLACED = Object.fromEntries(LINE_MOVES.map(key => [key, 0]))

const hooks = []
let codec = null
let action = null
let property = null
let incremental = null

function keysOf(...kinds) {
  return kinds.flatMap(kind => ["X", "Y", "Z"].map(axis => kind + axis))
}

export function titleFileName() {
  return Project.name || fileNameOf(titles().map(home => home.describe()).join(" "), "title")
}

function titles(nodes = Outliner.root) {
  return nodes.flatMap(node => isTitle(node) ? [node] : titles(node.children ?? []))
}

function otherContents() {
  const counts = new Map()
  function add(name, amount) {
    if (amount) counts.set(name, (counts.get(name) ?? 0) + amount)
  }
  for (const element of Outliner.elements) {
    if (!isTitle(element)) add(element.title, 1)
  }
  add("Group", Group.all.length)
  add("Collection", Collection.all.length)
  add("Reference Image", Project.reference_images.length)
  return counts
}

function onlyTitles() {
  return !!Project && Format.id === FORMAT && Outliner.elements.length > 0 && !otherContents().size
}

export function isBlank() {
  if (Texture.all.length || otherContents().size) return false
  const homes = titles()
  if (homes.length > 1) return false
  return homes.every(home => !home.words.length && isDefaultTitle(titleState().title, rounded({ ...home.settings, ...placed(home) })))
}

function titlePath() {
  return Project.export_path.endsWith(`.${EXTENSION}`) ? Project.export_path : null
}

function wordsIn(home) {
  return (home.words.length ? home.words : [home]).map(({ settings }) => settings)
}

function placed(home) {
  if (home.parent === "root") return lineTransform(home.settings, home.position, nativeTurn(home.rotation))
  const { mesh } = home
  const { pivot } = (home.words.length ? lineOf(home) : memberOf(home)) ?? { pivot: new THREE.Vector3() }
  const model = Project.model_3d
  const position = model.worldToLocal(mesh.getWorldPosition(new THREE.Vector3())).sub(pivot).toArray()
  const turn = model.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(mesh.getWorldQuaternion(new THREE.Quaternion()))
  return lineTransform(home.settings, position, turn)
}

function rounded(values) {
  return { ...values, ...Object.fromEntries(MOVES.map(key => [key, round(values[key], 3)])) }
}

function keptOf(element) {
  return { ...(element.name !== element.describe() && { name: element.name }), ...(element.locked && { locked: true }) }
}

function keptLine(home) {
  const words = home.words.map(keptOf)
  return { ...keptOf(home), ...(words.some(word => Object.keys(word).length) && { words }) }
}

export function titleFileData() {
  const { title } = titleState()
  const homes = titles()
  const values = new Map(homes.flatMap(home => {
    const place = placed(home)
    return wordsIn(home).map(settings => [settings, rounded({ ...settings, ...place })])
  }))
  return fileData(homes.map(wordsIn), title.camera, settings => trimUnused(values.get(settings), title))
}

function shownTexts(home) {
  return (home.words.length ? home.words : [home]).filter(({ settings }) => !settings.hidden && settings.shape === null)
}

export function hasTitles() {
  return titles().length > 0
}

export function titleText() {
  return titles().map(home => {
    const words = shownTexts(home)
    return joinWords(words.map(({ settings }) => settings), settings => settings.text.trim())
  }).filter(Boolean).join(" ")
}

export function isCased() {
  return titles().some(home => shownTexts(home).some(element => runtimeOf(element).font?.multicase))
}

function compile() {
  const lines = titles().map(keptLine)
  const counted = countedInFile()
  const own = { ...(lines.some(line => Object.keys(line).length) && { lines }), ...(counted.length && { counted }) }
  const { preset } = Project[KEPT]
  const data = { ...titleFileData(), ...(preset && { preset }), ...(Object.keys(own).length && { blockbench: own }) }
  return JSON.stringify(data, null, 2)
}

function place(element, values, { name, locked }, parent) {
  element.useSettings({ ...values, ...UNPLACED, group: null, matchWidth: null })
  element.locked = !!locked
  element.visibility = !values.hidden
  element.addTo(parent).init()
  element.name = name ?? (element.describe() || "title")
}

function addWord(values, own, home) {
  const word = new types.word({})
  word.position.replace(nativePosition(values))
  word.rotation.replace(nativeWordRotation(values))
  word.scale.replace([values.wordScaleX, values.wordScaleY, values.wordScaleZ])
  place(word, values, own, home)
  return word
}

function addLine(words, own) {
  const [first] = words
  const grouped = first.group != null
  const hidden = words.every(word => word.hidden)
  const home = new (first.shape === null ? types.text : types.shape)({})
  const { position, rotation } = nativeLine(first)
  home.position.replace(position)
  home.rotation.replace(rotation)
  home.scale.replace([first.scaleX, first.scaleY, first.scaleZ])
  if (grouped) home.temp_data.awaitsWords = true
  place(home, { ...first, hidden, ...(grouped && { text: "" }) }, own, "root")
  if (!grouped) return [home]
  const added = words.map((word, index) => addWord({ ...word, hidden: word.hidden && !hidden }, own.words?.[index] ?? {}, home))
  home.isOpen = true
  if (!own.name) home.name = home.describe() || "title"
  return added
}

function show({ values, camera, preset }, own = {}) {
  setCamera(titleState().title.camera, camera)
  Project[KEPT] = { ...(camera && { camera }), ...(preset && { preset }) }
  const lines = values.map((words, index) => addLine(words, own.lines?.[index] ?? {}))
  settleTitle()
  quietly(() => {
    for (const [index, added] of lines.entries()) {
      const { matchWidth } = values[index][0]
      if (matchWidth === null) continue
      for (const { settings } of added) settings.matchWidth = lines[matchWidth][0].uuid
    }
  })
  unselectAllElements()
  const homes = lines.map(([first]) => homeElement(first))
  homes[0].select()
  return homes
}

function parse({ own, ...data }) {
  restoreCounted(own.counted)
  show(data, own)
  openTitleMode()
}

function readPreset({ code, id, name }) {
  const title = openableTitle(code)
  return { values: titleValues(title), camera: title.camera, preset: id === undefined ? null : { id, name } }
}

function nameAfter({ name }) {
  Project.name = name.replace(/[\\/:*?"<>|]/g, "").trim()
}

export function openPreset(preset) {
  const data = readPreset(preset)
  setupProject(Formats[FORMAT])
  nameAfter(preset)
  parse({ ...data, own: {} })
}

export function replaceWithPreset(preset) {
  const data = readPreset(preset)
  if (isBlank() && !Project.name) nameAfter(preset)
  openTitleMode()
  finishEdit()
  const old = titles()
  Undo.initEdit({ outliner: true, elements: old.flatMap(familyOf), selection: true, ...WHOLE })
  for (const home of old) home.remove()
  const homes = show(data)
  Undo.finishEdit("Use title preset", { outliner: true, elements: homes.flatMap(familyOf), selection: true, ...WHOLE })
}

function read(text) {
  const data = readTitle(text)
  const own = JSON.parse(text).blockbench ?? {}
  return { ...data, own: own.lines?.length === data.values.length ? own : { ...own, lines: null } }
}

function warnOfLosses(done) {
  const counts = otherContents()
  const grouped = counts.has("Group")
  if (Texture.all.length) counts.set("Texture", Texture.all.length)
  const list = Array.from(counts, ([name, amount]) => `- ${amount} × ${name}`).join("\n")
  Blockbench.showMessageBox({
    title: "Export Minecraft Title",
    icon: "warning",
    message: `A Minecraft title file can only hold title texts and shapes. These will be left out:\n\n${list}${grouped ? "\n\nTitles inside groups will stay where they are." : ""}`,
    buttons: ["Export", "dialog.cancel"],
    cancelIndex: 1
  }, button => {
    if (button === 0) done()
  })
}

function exportTitle() {
  if (onlyTitles()) codec.export()
  else warnOfLosses(() => codec.export())
}

function save() {
  if (isApp && titlePath()) codec.write(codec.compile(), titlePath())
  else codec.export()
}

function saveNumbered() {
  const [, folder, start, number] = titlePath().match(/^(.*[\\/])(.*?)(\d*)\.[^.]+$/)
  const taken = new Set()
  Filesystem.findFileFromContent([folder], { recursive: false, read_file: false }, path => {
    taken.add(path.split(/[\\/]/).at(-1).toLowerCase())
  })
  let next = Number(number) + 1
  const name = () => `${start}${number ? "" : "_"}${next}.${EXTENSION}`
  while (taken.has(name().toLowerCase())) next++
  codec.write(codec.compile(), folder + name())
}

function saveAll() {
  if (onlyTitles()) {
    save()
    return false
  }
  if (!isApp || Format.id !== FORMAT || !titlePath()) return
  BarItems.save_project.click()
  return false
}

function whenOnlyTitles(replacement) {
  return () => {
    if (!onlyTitles()) return
    replacement()
    return false
  }
}

function insteadOf(id, replacement) {
  hooks.push(BarItems[id].on("use", replacement))
}

export function sourcePreset() {
  return presetSource(Project[KEPT]?.preset)
}

export function forgetPreset({ id }) {
  if (sourcePreset()?.id !== id) return
  const { preset, ...others } = Project[KEPT]
  Project[KEPT] = others
  Project.saved = false
}

export function keepCamera(changes) {
  const { camera, ...others } = Project[KEPT]
  Project[KEPT] = { ...others, ...(Object.keys(changes).length && { camera: changes }) }
  Project.saved = false
}

function useCamera() {
  if (Format.id === FORMAT) setCamera(titleState().title.camera, Project[KEPT].camera)
}

export function registerFile() {
  property = new Property(ModelProject, "object", KEPT, { condition: { formats: [FORMAT] } })
  codec = new Codec(FORMAT, {
    name: "Minecraft Title",
    extension: EXTENSION,
    remember: true,
    format: Formats[FORMAT],
    load_filter: { type: "text", extensions: [EXTENSION] },
    load(text, file, args) {
      try {
        Codec.prototype.load.call(this, read(text), file, args)
      } catch (err) {
        Blockbench.showMessageBox({ title: `Couldn't open ${file.name}`, message: err.message })
        console.error(err)
      }
    },
    compile,
    parse,
    fileName: titleFileName,
    afterDownload(path) {
      if (onlyTitles()) Codec.prototype.afterDownload.call(this, path)
      else Blockbench.showQuickMessage(tl("message.save_file", [path]))
    }
  })
  codec.startPath = () => Project.export_path || Project.save_path
  Object.defineProperty(Formats[FORMAT], "codec", { configurable: true, enumerable: true, get: () => onlyTitles() ? codec : Codecs.project })
  action = new Action("export_minecraft_title", { name: "Export Minecraft Title", icon: "text_fields", category: "file", condition: () => Format?.id === FORMAT && Outliner.elements.some(isTitle), click: exportTitle })
  codec.export_action = action
  MenuBar.menus.file.addAction(action, "export.0")
  insteadOf("export_over", saveAll)
  insteadOf("save_project", whenOnlyTitles(save))
  insteadOf("save_project_as", whenOnlyTitles(() => codec.export()))
  insteadOf("save_project_incremental", whenOnlyTitles(saveNumbered))
  incremental = BarItems.save_project_incremental.condition
  BarItems.save_project_incremental.condition = () => onlyTitles() ? isApp && titlePath() : Condition(incremental)
  Codecs.project.on("parsed", useCamera)
}

export function unregisterFile() {
  Codecs.project.removeListener("parsed", useCamera)
  BarItems.save_project_incremental.condition = incremental
  for (const hook of hooks.splice(0)) hook.delete()
  action.delete()
  codec.delete()
  property.delete()
}
