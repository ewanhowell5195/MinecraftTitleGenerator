import { before, beforeEach, describe, test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import { computed, effectScope, reactive, ref, shallowRef } from "vue"
import { CAMERA_PANEL } from "#lib/panels/camera.js"
import { FACE_PANELS, FILTERS_PANEL, OUTLINE_PANEL } from "#lib/panels/colour.js"
import { CONTROLS, checkControls } from "#lib/panels/controls.js"
import { CREEPER_PANEL, CURVES_PANEL, SPACING_PANEL, TERMINATORS_PANEL } from "#lib/panels/font.js"
import { ARC_PANEL, GEOMETRY_PANEL } from "#lib/panels/form.js"
import { usePanelHost } from "#lib/panels/host.js"
import { layersPanel } from "#lib/panels/layers.js"
import { EDGE_OVERLAYS_PANEL, OVERLAYS_PANEL } from "#lib/panels/overlays.js"
import { useOverlayLayers } from "#lib/panels/overlayLayers.js"
import { usePanelState } from "#lib/panels/panel.js"
import { PLACEMENT_PANEL } from "#lib/panels/placement.js"
import { RENDER_PANELS, SECTION_PANELS, sectionFits, sectionPanels } from "#lib/panels/sections.js"
import { nearestStep, sliderFill, sliderPosition, sliderValue } from "#lib/panels/slider.js"
import { TILING_PANEL } from "#lib/panels/tiling.js"
import { TWIST_PANELS } from "#lib/panels/twists.js"
import { splitWord } from "#lib/panels/words.js"
import { fullCamera } from "#lib/settings/camera.js"
import { PANELS, objectDefaults } from "#lib/settings/defaults.js"
import { createObject } from "#lib/settings/objects.js"
import { wordKey } from "#lib/settings/settings.js"
import { createTitle, wordsOf } from "#lib/title/title.js"

const SET_BY_PLACEMENT = ["depthAnchor"]
const FORM = [GEOMETRY_PANEL, ARC_PANEL].concat(TWIST_PANELS)
const SECTIONS = { arc: ARC_PANEL, colour: FILTERS_PANEL, curves: CURVES_PANEL, creeper: CREEPER_PANEL, geometry: GEOMETRY_PANEL, outline: OUTLINE_PANEL, spacing: SPACING_PANEL, terminators: TERMINATORS_PANEL, tiling: TILING_PANEL }
for (const panel of FACE_PANELS.concat(TWIST_PANELS)) SECTIONS[panel.id] = panel

const LIST = { textures: { flat: {} }, overlays: { shine: { generated: "shine", default: { blend: "screen", opacity: 60 } } }, edgeOverlays: {} }
const FONT = { id: "test", glyphs: {}, layers: [{}, {}] }

const current = ref(null)
const active = shallowRef({})
const layer = ref(0)
const title = createTitle([], { render: false })
let scope

function flat(controls) {
  return Array.isArray(controls) ? controls.flatMap(control => control.controls ? flat(control.controls) : [control]) : []
}

function keysOf(panel) {
  return flat(panel.controls).flatMap(control => control.key ?? []).concat(panel.enabled ?? [])
}

function open(panel, word = false) {
  return scope.run(() => usePanelState(panel, word))
}

function shownKeys(panel, state) {
  return flat(panel.controls).filter(control => control.key && state.isShown(control)).map(control => control.key)
}

function control(panel, key) {
  return flat(panel.controls).find(item => item.key === key)
}

function edit(values) {
  const object = createObject(values)
  title.objects = [object]
  current.value = object
  return object
}

before(() => {
  usePanelHost({ title, library: { tileables: {} }, camera: reactive(fullCamera()), active, current, currentWord: current, line: current, layer, words: object => wordsOf(object, title), popular: entries => entries })
})

beforeEach(() => {
  scope?.stop()
  scope = effectScope(true)
  active.value = { font: FONT, list: LIST }
})

describe("panel definitions", () => {
  for (const [name, panel] of Object.entries(SECTIONS)) {
    test(`${name} has a control for every setting in its section`, () => {
      const keys = new Set(keysOf(panel))
      assert.deepEqual(Object.keys(PANELS[name]()).filter(key => !keys.has(key) && !SET_BY_PLACEMENT.includes(key)), [])
    })
  }

  for (const panel of Object.values(SECTIONS).concat(PLACEMENT_PANEL, layersPanel("texture"), OVERLAYS_PANEL, EDGE_OVERLAYS_PANEL)) {
    test(`${panel.id} only names settings that exist`, () => {
      const known = objectDefaults()
      assert.deepEqual(keysOf(panel).filter(key => !(key in known)), [])
    })
  }

  test("every form setting a word can have is one words have", () => {
    for (const panel of FORM) {
      const known = PANELS[wordKey(panel.id)]()
      const own = keysOf(panel).filter(key => !["clipHoles", "layerWords", "arcGradient"].includes(key))
      assert.deepEqual(own.map(wordKey).filter(key => !(key in known)), [])
    }
  })
})

describe("controls", () => {
  const source = path => fs.readFileSync(new URL(`../../${path}`, import.meta.url), "utf8")
  const drawn = { website: source("src/app/panels/DataControls.vue"), plugin: source("blockbench/src/panels/controls.js") }

  for (const type of CONTROLS) {
    test(`both apps draw a ${type}`, () => {
      for (const [app, code] of Object.entries(drawn)) assert.ok(code.includes(`control.type === '${type}'`), `the ${app} has no ${type}`)
    })
  }

  test("every panel is made of controls that can be drawn", () => {
    for (const panel of Object.values(SECTION_PANELS).flat().concat(RENDER_PANELS, CAMERA_PANEL)) {
      const checked = controls => {
        if (!Array.isArray(controls)) return
        checkControls(panel.id, controls, { renderOutput: {} })
        for (const control of controls) checked(control.controls)
      }
      checked(panel.controls)
    }
  })

  test("a control that can't be drawn is an error", () => {
    assert.throws(() => checkControls("font", [{ type: "knob" }], {}), /font panel has a knob control/)
    assert.throws(() => checkControls("image", [{ type: "block", name: "extra" }], {}), /image panel has a extra control/)
  })
})

describe("sections", () => {
  const fitting = shape => Object.keys(SECTION_PANELS).filter(id => sectionFits(id, shape))

  test("text has no shape sections", () => {
    assert.deepEqual(fitting(null), ["text", "font", "texture", "colour", "overlays", "form"])
  })

  test("shapes have no text sections, and Minecraft's own bring their texture", () => {
    assert.deepEqual(fitting("creeper"), ["shape", "placement", "texture", "colour", "overlays", "form"])
    assert.deepEqual(fitting("minecraft.block/stone"), ["shape", "placement", "colour", "form"])
  })

  test("shapes only have their geometry to form", () => {
    assert.deepEqual(sectionPanels("form", "creeper"), [GEOMETRY_PANEL])
    assert.deepEqual(sectionPanels("form", null), FORM)
  })
})

describe("sliders", () => {
  const plain = { min: -50, max: 150, step: 1 }
  const log = { min: 0.1, max: 10, step: 0.1, log: true }
  const stepped = { min: 1, max: 100, steps: [1, 5, 100] }

  test("a stepped slider stands on its nearest step", () => {
    assert.equal(nearestStep(stepped.steps, 40), 1)
    assert.deepEqual([sliderPosition(stepped, 70), sliderValue(stepped, 2)], [2, 100])
  })

  test("a log slider has its middle halfway along", () => {
    assert.equal(sliderPosition(log, 1), 500)
    assert.equal(sliderValue(log, 500), 1)
  })

  test("the fill starts from zero", () => {
    assert.deepEqual(sliderFill(plain, 50), { "--from": "25%", "--to": "50%" })
    assert.deepEqual(sliderFill(plain, -50), { "--from": "0%", "--to": "25%" })
    assert.deepEqual(sliderFill(stepped, 5), { "--from": "0%", "--to": "50%" })
  })
})

describe("a panel's state", () => {
  test("reads and writes the object being edited", () => {
    const object = edit({ hue: 40 })
    const state = open(FILTERS_PANEL)
    assert.equal(state.valueOf(control(FILTERS_PANEL, "hue")), 40)
    state.change(control(FILTERS_PANEL, "hue"), 90)
    assert.equal(object.hue, 90)
  })

  test("follows the selection", () => {
    edit({ hue: 40 })
    const state = open(FILTERS_PANEL)
    edit({ hue: 70 })
    assert.equal(state.valueOf(control(FILTERS_PANEL, "hue")), 70)
  })

  test("notices changes and resets them", () => {
    const object = edit({})
    const state = open(FILTERS_PANEL)
    assert.equal(state.modified.value, false)
    object.hue = 10
    assert.equal(state.modified.value, true)
    state.reset()
    assert.equal(object.hue, 0)
    assert.equal(state.modified.value, false)
  })

  test("a word's settings fall back to its line's", () => {
    const object = edit({ depth: 30 })
    const state = open(GEOMETRY_PANEL, true)
    const depth = control(GEOMETRY_PANEL, "depth")
    assert.equal(state.valueOf(depth), 30)
    state.change(depth, 12)
    assert.deepEqual([object.depth, object.wordDepth, state.valueOf(depth)], [30, 12, 12])
  })

  test("word spacing shows the font's own space until it is set", () => {
    const object = edit()
    const spacing = control(SPACING_PANEL, "spaceWidth")
    const state = open(SPACING_PANEL)
    active.value = { font: { ...FONT, spaceWidth: 14 }, list: LIST }
    assert.equal(state.valueOf(spacing), 14)
    active.value = { font: { ...FONT, spaceWidth: 16 }, list: LIST }
    assert.equal(state.valueOf(spacing), 16)
    state.change(spacing, 5)
    assert.equal(object.spaceWidth, 5)
    assert.equal(state.valueOf(spacing), 5)
    state.reset()
    assert.equal(object.spaceWidth, null)
    assert.equal(state.valueOf(spacing), 16)
  })

  test("terminator spacing shows the font's own gap until it is set, and only with terminators", () => {
    const object = edit({ terminators: true })
    const spacing = control(SPACING_PANEL, "terminatorSpace")
    const state = open(SPACING_PANEL)
    const ends = { glyphs: { ...FONT.glyphs, "┫": {}, "┣": {} } }
    active.value = { font: { ...FONT, ...ends, terminatorSpace: true, terminatorSpaceWidth: 3 }, list: LIST }
    assert.equal(state.valueOf(spacing), 3)
    active.value = { font: { ...FONT, ...ends, terminatorSpace: false, terminatorSpaceWidth: 3 }, list: LIST }
    assert.equal(state.valueOf(spacing), 0)
    state.change(spacing, 5)
    assert.equal(object.terminatorSpace, 5)
    assert.equal(state.valueOf(spacing), 5)
    assert.equal(state.isShown(spacing), true)
    object.terminators = false
    assert.equal(state.isShown(spacing), false)
    active.value = { font: { ...FONT, ...ends, forcedTerminators: true }, list: LIST }
    assert.equal(state.isShown(spacing), true)
    active.value = { font: FONT, list: LIST }
    assert.equal(state.isShown(spacing), false)
  })

  test("a switched off panel can be turned on", () => {
    const object = edit({ internalFaces: false })
    const state = open(FACE_PANELS[1])
    assert.equal(state.enabled.value, false)
    state.enable(true)
    assert.equal(object.internalFaces, true)
    assert.equal(state.enabled.value, true)
  })

  for (const panel of TWIST_PANELS) {
    test(`${panel.id} only shows its amount until it turns`, () => {
      const object = edit({})
      const state = open(panel)
      const [amount, ...rest] = keysOf(panel)
      assert.deepEqual(shownKeys(panel, state), [amount])
      object[amount] = 30
      assert.deepEqual(shownKeys(panel, state), [amount].concat(rest))
    })
  }

  test("picking a gradient starts it from the colour it had", () => {
    const object = edit({ customEdge: true, edgeColour: "#123456" })
    const state = open(FACE_PANELS[0])
    state.change(control(FACE_PANELS[0], "edgeFill"), "gradient")
    assert.equal(object.edgeStops[0].colour, "#123456")
  })

  test("a camera preset moves the camera and back to custom again", () => {
    const state = open(CAMERA_PANEL)
    const [preset] = CAMERA_PANEL.controls
    state.change(control(CAMERA_PANEL, "pitch"), 12)
    assert.equal(state.valueOf(preset), "custom")
    state.change(preset, "front")
    assert.deepEqual([state.valueOf(preset), state.context.get("pitch")], ["front", 0])
    state.reset()
    assert.equal(state.valueOf(preset), "minecraft")
  })

  test("the layers panel needs more than one layer and separates them", () => {
    const panel = layersPanel("colour")
    const object = edit({})
    const state = open(panel)
    assert.equal(state.shown.value, false)
    active.value = { font: FONT, list: LIST, built: { layers: [0, 1] } }
    assert.equal(state.shown.value, true)
    state.change(panel.controls[0], true)
    assert.equal(object.layerSettings.length, 1)
    const filters = open(FILTERS_PANEL)
    state.change(panel.controls[1], 1)
    filters.change(control(FILTERS_PANEL, "hue"), 55)
    assert.deepEqual([object.hue, object.layerSettings[0].hue], [0, 55])
    layer.value = 0
  })
})

describe("overlay layers", () => {
  function opened(values) {
    const object = edit(values)
    const state = open(OVERLAYS_PANEL)
    const { available, edit: editing, layers, selected } = state.context.state
    const props = { get layers() { return layers.value }, edit: editing, get available() { return available.value }, font: FONT, statScope: null, edge: false, files: true, reuse: [] }
    return { object, selected, list: scope.run(() => useOverlayLayers(props, selected, entries => entries)) }
  }

  test("editing a default overlay copies the defaults into the line", () => {
    const { object, list } = opened({})
    list.pickOverlay("shine")
    assert.equal(object.overlayMode, "custom")
    assert.deepEqual(object.overlays.map(item => item.overlay), ["shine"])
  })

  test("a setting the overlay never had is noticed", () => {
    const { object, list } = opened({ overlayMode: "custom", overlays: [{ overlay: "shine", source: "premade", blend: "screen", colours: null, opacity: 60 }] })
    const width = computed(() => list.layer.value.width)
    assert.equal(width.value, undefined)
    list.set("width", 20)
    assert.equal(object.overlays[0].width, 20)
    assert.equal(width.value, 20)
  })

  test("layers can be duplicated, moved and removed", () => {
    const { object, list, selected } = opened({ overlayMode: "custom", overlays: [{ overlay: "shine", source: "premade", blend: "screen", colours: null, opacity: 60 }] })
    list.duplicateLayer(0)
    list.set("opacity", 10)
    assert.deepEqual([object.overlays.map(item => item.opacity), selected.value], [[60, 10], 1])
    list.moveLayer(1, 0)
    assert.deepEqual([object.overlays.map(item => item.opacity), selected.value], [[10, 60], 0])
    list.removeLayer(0)
    assert.deepEqual(object.overlays.map(item => item.opacity), [60])
  })
})

describe("splitting a word", () => {
  test("cuts the picked text out and keeps the spaces between", () => {
    assert.deepEqual(splitWord({ text: "big old title", spaceBefore: true }, 4, 7), [
      { text: "big", spaceBefore: true, picked: false },
      { text: "old", spaceBefore: true, picked: true },
      { text: "title", spaceBefore: true, picked: false }
    ])
  })

  test("joins parts with no space between them", () => {
    assert.deepEqual(splitWord({ text: "overlay", spaceBefore: false }, 4, 7).map(({ text, spaceBefore }) => [text, spaceBefore]), [["over", false], ["lay", false]])
  })

  test("does nothing with nothing or everything picked", () => {
    assert.equal(splitWord({ text: "title", spaceBefore: true }, 2, 2), null)
    assert.equal(splitWord({ text: "title", spaceBefore: true }, 0, 5), null)
  })
})
