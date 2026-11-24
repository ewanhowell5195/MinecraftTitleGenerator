import { describe, test } from "node:test"
import assert from "node:assert/strict"
import { TWIST_PANELS } from "../../src/lib/panels/twists.js"
import { PANELS } from "../../src/lib/settings/defaults.js"
import { wordKey } from "../../src/lib/settings/settings.js"

function keysOf(panel) {
  return panel.controls.flatMap(control => control.key ?? [])
}

function shownKeys(panel, values) {
  return panel.controls.filter(control => control.key && (control.shown?.(key => values[key]) ?? true)).map(control => control.key)
}

for (const panel of TWIST_PANELS) {
  describe(`the ${panel.id} panel`, () => {
    test("has a control for every setting in its section, on lines and words", () => {
      assert.deepEqual(keysOf(panel).toSorted(), Object.keys(PANELS[panel.id]()).toSorted())
      assert.deepEqual(keysOf(panel).map(wordKey).toSorted(), Object.keys(PANELS[wordKey(panel.id)]()).toSorted())
    })

    test("only shows its amount until it turns", () => {
      const values = PANELS[panel.id]()
      const [amount] = keysOf(panel)
      assert.deepEqual(shownKeys(panel, values), [amount])
      const roll = keysOf(panel).find(key => key.endsWith("Roll"))
      assert.deepEqual(shownKeys(panel, { ...values, [amount]: 30 }), keysOf(panel))
      if (roll) assert.deepEqual(shownKeys(panel, { ...values, [amount]: 30, [roll]: false }), keysOf(panel).slice(0, -1))
    })
  })
}
