import { describe, test } from "node:test"
import assert from "node:assert/strict"
import { nextTick, ref } from "vue"
import { useLoaded, usePreviewLine } from "../src/submissions/kinds/preview.js"

function deferred() {
  const made = {}
  made.promise = new Promise((fulfil, reject) => Object.assign(made, { fulfil, reject }))
  return made
}

async function settled() {
  await nextTick()
  for (let tick = 0; tick < 5; tick++) await new Promise(resolve => setImmediate(resolve))
}

describe("preview lines", () => {
  test("builds straight away and again when an input changes", async () => {
    const text = ref("One")
    const { line, problem } = usePreviewLine(() => [text.value], async () => ({ text: text.value }))
    await settled()
    assert.deepEqual(line.value, { text: "One" })
    text.value = "Two"
    await settled()
    assert.deepEqual(line.value, { text: "Two" })
    assert.equal(problem.value, "")
  })

  test("a failed build shows its problem and no line", async () => {
    const text = ref("One")
    const { line, problem } = usePreviewLine(() => [text.value], async () => {
      if (text.value === "Bad") throw new Error("the file could not be loaded (404)")
      return { text: text.value }
    })
    await settled()
    text.value = "Bad"
    await settled()
    assert.equal(line.value, null)
    assert.equal(problem.value, "the file could not be loaded (404)")
  })

  test("nothing to build clears an old problem", async () => {
    const text = ref("Bad")
    const { line, problem } = usePreviewLine(() => [text.value], async () => {
      if (text.value === "Bad") throw new Error("broken")
      return text.value ? { text: text.value } : null
    })
    await settled()
    assert.equal(problem.value, "broken")
    text.value = ""
    await settled()
    assert.equal(line.value, null)
    assert.equal(problem.value, "")
  })

  test("an older build that finishes late is ignored", async () => {
    const text = ref("old")
    const builds = { old: deferred(), new: deferred() }
    const { line, problem } = usePreviewLine(() => [text.value], () => builds[text.value].promise)
    text.value = "new"
    await settled()
    builds.new.fulfil({ text: "new" })
    await settled()
    builds.old.fulfil({ text: "old" })
    await settled()
    assert.deepEqual(line.value, { text: "new" })
    assert.equal(problem.value, "")
  })

  test("an older build that fails late is ignored", async () => {
    const text = ref("old")
    const builds = { old: deferred(), new: deferred() }
    const { line, problem } = usePreviewLine(() => [text.value], () => builds[text.value].promise)
    text.value = "new"
    await settled()
    builds.new.fulfil({ text: "new" })
    await settled()
    builds.old.reject(new Error("too late"))
    await settled()
    assert.deepEqual(line.value, { text: "new" })
    assert.equal(problem.value, "")
  })
})

describe("loaded values", () => {
  test("start as the empty value and go back to it on a failure", async () => {
    const fail = ref(false)
    const { value, problem } = useLoaded(() => fail.value, async () => {
      if (fail.value) throw new Error("no list")
      return ["stone"]
    }, [])
    assert.deepEqual(value.value, [])
    await settled()
    assert.deepEqual(value.value, ["stone"])
    fail.value = true
    await settled()
    assert.deepEqual(value.value, [])
    assert.equal(problem.value, "no list")
  })
})
