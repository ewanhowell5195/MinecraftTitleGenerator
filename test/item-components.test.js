import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { fitComponents, itemControls } from "../src/lib/itemComponents.js"

function model(id, extra = {}) {
  return { type: "minecraft:model", model: `minecraft:item/${id}`, ...extra }
}

const BOW = { model: { type: "minecraft:condition", property: "minecraft:using_item", on_false: model("bow"), on_true: { type: "minecraft:range_dispatch", property: "minecraft:use_duration", scale: 0.05, fallback: model("bow_pulling_0"), entries: [{ threshold: 0.65, model: model("bow_pulling_1") }, { threshold: 0.9, model: model("bow_pulling_2") }] } } }
const HELMET = { model: { type: "minecraft:select", property: "minecraft:trim_material", fallback: model("leather_helmet", { tints: [{ type: "minecraft:dye", default: -6265536 }] }), cases: [{ when: "minecraft:quartz", model: model("leather_helmet_quartz_trim") }, { when: ["minecraft:gold", "minecraft:gold_darker"], model: model("leather_helmet_gold_trim") }] } }
const CROSSBOW = { model: { type: "minecraft:select", property: "minecraft:charge_type", fallback: model("crossbow"), cases: [{ when: "arrow", model: model("crossbow_arrow") }, { when: "rocket", model: model("crossbow_firework") }] } }
const COMPASS = { model: { type: "minecraft:range_dispatch", property: "minecraft:compass", scale: 32, entries: [{ threshold: 0, model: model("compass_16") }, { threshold: 0.5, model: model("compass_17") }, { threshold: 31.5, model: model("compass_16") }] } }

function summary(controls) {
  return controls.map(control => [control.label, control.type === "select" ? control.options[control.value].label : control.value])
}

describe("item components", () => {
  test("only lists what the current choices reach", () => {
    assert.deepEqual(summary(itemControls(BOW, {})), [["Using", false]])
    assert.deepEqual(summary(itemControls(BOW, { using_item: true })), [["Using", true], ["Pull", "Bow Pulling 0"]])
  })

  test("a toggle and a range write the components the game reads", () => {
    const [using] = itemControls(BOW, {})
    const pulled = using.choose(true)
    assert.deepEqual(pulled, { using_item: true })
    const pull = itemControls(BOW, pulled)[1]
    const full = pull.choose(2)
    assert.equal(itemControls(BOW, full)[1].options[itemControls(BOW, full)[1].value].label, "Bow Pulling 2")
    assert.equal(full.use_duration, 28)
    assert.deepEqual(pull.choose(0), { using_item: true })
    assert.deepEqual(using.choose(false), {})
  })

  test("trims and dye colours", () => {
    const [trim, dye] = itemControls(HELMET, {})
    assert.deepEqual(trim.options.map(option => option.label), ["None", "Quartz", "Gold"])
    assert.equal(dye.value, "#a06540")
    assert.deepEqual(trim.choose(2), { trim: { material: "gold" } })
    assert.deepEqual(summary(itemControls(HELMET, { trim: { material: "minecraft:quartz" } })), [["Trim", "Quartz"]])
    assert.deepEqual(dye.choose("#ff0000"), { dyed_color: "#ff0000" })
  })

  test("the crossbow's charge comes from its projectiles", () => {
    const [charge] = itemControls(CROSSBOW, {})
    assert.deepEqual(charge.choose(2), { charged_projectiles: [{ id: "firework_rocket" }] })
    assert.equal(itemControls(CROSSBOW, { charged_projectiles: [{ id: "arrow" }] })[0].value, 1)
    assert.deepEqual(charge.choose(0), {})
  })

  test("a range lists each model once and skips a missing fallback", () => {
    assert.deepEqual(itemControls(COMPASS, {})[0].options.map(option => option.label), ["Compass 16", "Compass 17"])
  })

  test("potions come from the tint", () => {
    const potion = { model: model("potion", { tints: [{ type: "minecraft:potion", default: -13083194 }] }) }
    const [control] = itemControls(potion, {}, ["healing", "swiftness"])
    assert.deepEqual(control.options.map(option => option.label), ["Water", "Healing", "Swiftness"])
    assert.deepEqual(control.choose(2), { potion_contents: { potion: "swiftness" } })
  })

  test("display context follows the gui case without a control", () => {
    const bundle = { model: { type: "minecraft:select", property: "minecraft:display_context", fallback: model("spear"), cases: [{ when: "gui", model: BOW.model }] } }
    assert.deepEqual(summary(itemControls(bundle, {})), [["Using", false]])
  })

  test("switching items keeps only the components the new one uses", () => {
    assert.deepEqual(fitComponents(HELMET, { trim: { material: "gold" }, using_item: true }), { trim: { material: "gold" } })
    assert.equal(fitComponents({ model: model("diamond_sword") }, { trim: { material: "gold" } }), null)
    assert.deepEqual(fitComponents(BOW, {}), {})
  })
})
