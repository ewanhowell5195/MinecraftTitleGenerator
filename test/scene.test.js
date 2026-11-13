import { beforeEach, describe, mock, test } from "node:test"
import assert from "node:assert/strict"
import { nextTick } from "vue"
import { fakeTimeouts, forbidFetch } from "./helpers/browser.js"

const store = new Map()
let failWrites = false

function writeStore(key, value) {
  if (failWrites) throw new Error("quota exceeded")
  store.set(key, value)
}

globalThis.localStorage = { getItem: key => store.get(key) ?? null, setItem: writeStore }
forbidFetch()
fakeTimeouts()

const { FILE_VERSION, createObject, snapshot, typeDefaults } = await import("../src/lib/settings.js")
const { view } = await import("../src/lib/view.js")
const { addObject, addWord, bakeMatch, chooseMatch, current, currentWord, duplicateLine, insertWord, keepTexture, lineHidden, lineText, removeLine, removeObject, runtime, saveError, scene, select, selectGroup, selection, setScale, shapingWord, titleFileName, toggleLine, validSelection, wordTabs, words } = await import("../src/lib/scene.js")

function setScene(...objects) {
  scene.objects = objects
  Object.assign(scene, validSelection(objects, null, null))
  return objects
}

function line(group, ...texts) {
  return texts.map(text => createObject({ text, group }))
}

function texts() {
  return scene.objects.map(object => object.text)
}

beforeEach(() => {
  setScene(createObject())
})

describe("validSelection", () => {
  const objects = [{ id: 1, group: null }, { id: 2, group: 5 }, { id: 3, group: 5 }]

  test("keeps a selection that still exists", () => {
    assert.deepEqual(validSelection(objects, 2, 5), { selected: 2, selectedGroup: 5 })
  })

  test("falls back to the first object for a missing selection", () => {
    assert.equal(validSelection(objects, 99, null).selected, 1)
    assert.equal(validSelection(objects, null, null).selected, 1)
  })

  test("clears a group that no longer exists", () => {
    assert.equal(validSelection(objects, 2, 8).selectedGroup, null)
  })

  test("handles an empty scene", () => {
    assert.deepEqual(validSelection([], 2, 5), { selected: null, selectedGroup: null })
  })

  test("a null group never matches ungrouped objects", () => {
    assert.equal(validSelection([{ id: 1, group: null }], 1, null).selectedGroup, null)
  })
})

describe("words", () => {
  test("an ungrouped object is its own line", () => {
    const [a] = setScene(createObject({ text: "a" }), createObject({ text: "b" }))
    assert.deepEqual(words(a).map(word => word.text), ["a"])
  })

  test("a grouped object gets its group in scene order", () => {
    const [a, b] = line(1, "a", "b")
    const [c] = line(2, "c")
    setScene(a, b, c)
    assert.deepEqual(words(b).map(word => word.text), ["a", "b"])
    assert.deepEqual(words(c).map(word => word.text), ["c"])
  })

  test("ungrouped objects are never lumped together", () => {
    const [a, b] = setScene(createObject(), createObject())
    assert.equal(words(a).length, 1)
    assert.equal(words(b).length, 1)
  })
})

describe("lineText", () => {
  test("joins words with spaces where they ask for one", () => {
    const [a, b, c] = line(1, "one", "two", "three")
    b.spaceBefore = false
    setScene(a, b, c)
    assert.equal(lineText(a), "onetwo three")
  })

  test("ignores the first word's spaceBefore", () => {
    const [a] = setScene(createObject({ text: "solo", spaceBefore: true }))
    assert.equal(lineText(a), "solo")
  })

  test("trims each word and the result", () => {
    const [a, b] = line(1, "  one  ", "  two  ")
    setScene(a, b)
    assert.equal(lineText(a), "one two")
  })

  test("is empty for blank words", () => {
    const [a, b] = line(1, "   ", " ")
    setScene(a, b)
    assert.equal(lineText(a), "")
  })
})

describe("setScale", () => {
  test("without a link only sets the given axis", () => {
    const object = createObject({ scaleX: 1, scaleY: 1 })
    setScale(object, "scaleX", 2)
    assert.equal(object.scaleX, 2)
    assert.equal(object.scaleY, 1)
  })

  test("a linked X sets Y to X times the link", () => {
    const object = createObject({ linkScale: 2 })
    setScale(object, "scaleX", 1.5)
    assert.equal(object.scaleX, 1.5)
    assert.equal(object.scaleY, 3)
  })

  test("a linked Y sets X to Y over the link", () => {
    const object = createObject({ linkScale: 2 })
    setScale(object, "scaleY", 3)
    assert.equal(object.scaleY, 3)
    assert.equal(object.scaleX, 1.5)
  })

  test("the linked axis is rounded to four places", () => {
    const object = createObject({ linkScale: 3 })
    setScale(object, "scaleY", 1)
    assert.equal(object.scaleX, 0.3333)
    setScale(object, "scaleX", 1.23456)
    assert.equal(object.scaleY, 3.7037)
  })

  test("the Z axis is never linked", () => {
    const object = createObject({ linkScale: 2 })
    setScale(object, "scaleZ", 5)
    assert.equal(object.scaleZ, 5)
    assert.equal(object.scaleX, 1)
    assert.equal(object.scaleY, 1)
  })

  test("word scale uses the word link", () => {
    const object = createObject({ wordLinkScale: 2 })
    setScale(object, "wordScaleX", 1.5)
    assert.equal(object.wordScaleY, 3)
    assert.equal(object.scaleX, 1)
    assert.equal(object.scaleY, 1)
    setScale(object, "wordScaleY", 5)
    assert.equal(object.wordScaleX, 2.5)
  })

  test("line and word links do not cross over", () => {
    const object = createObject({ linkScale: 2 })
    setScale(object, "wordScaleX", 3)
    assert.equal(object.wordScaleY, 1)
    assert.equal(object.scaleY, 1)
  })

  test("a value that is not finite does not touch the linked axis", () => {
    const object = createObject({ linkScale: 2, scaleY: 4 })
    setScale(object, "scaleX", Number.NaN)
    assert.ok(Number.isNaN(object.scaleX))
    assert.equal(object.scaleY, 4)
  })
})

describe("insertWord", () => {
  test("groups an ungrouped source", () => {
    const [source] = setScene(createObject({ text: "a" }))
    const word = insertWord(source, { text: "b" })
    assert.notEqual(source.group, null)
    assert.equal(word.group, source.group)
    assert.deepEqual(texts(), ["a", "b"])
  })

  test("picks a group above every existing one", () => {
    const [a, b] = line(7, "a", "b")
    const source = createObject({ text: "c" })
    setScene(a, b, source)
    insertWord(source, { text: "d" })
    assert.equal(source.group, 8)
  })

  test("keeps an existing group", () => {
    const [a, b] = line(3, "a", "b")
    setScene(a, b)
    const word = insertWord(a, { text: "c" })
    assert.equal(a.group, 3)
    assert.equal(word.group, 3)
  })

  test("goes straight after the source", () => {
    const [a, b] = line(3, "a", "b")
    const c = createObject({ text: "c" })
    setScene(a, b, c)
    insertWord(a, { text: "new" })
    assert.deepEqual(texts(), ["a", "new", "b", "c"])
  })

  test("copies the source's settings with the given overrides and a new id", () => {
    const [source] = setScene(createObject({ text: "a", hue: 40, texture: "fired", matchWidth: 12 }))
    const word = insertWord(source, { text: "b", spaceBefore: false })
    assert.notEqual(word.id, source.id)
    assert.equal(word.text, "b")
    assert.equal(word.spaceBefore, false)
    assert.equal(word.hue, 40)
    assert.equal(word.texture, "fired")
    assert.equal(word.matchWidth, 12)
    assert.ok(keepTexture.has(word))
  })
})

describe("addWord", () => {
  test("adds after the last word of the line and selects it", () => {
    const [a, b] = line(2, "a", "b")
    const c = createObject({ text: "c" })
    setScene(a, b, c)
    scene.selectedGroup = 2
    addWord(a)
    assert.deepEqual(texts(), ["a", "b", "word", "c"])
    const word = scene.objects[2]
    assert.equal(word.group, 2)
    assert.equal(word.spaceBefore, true)
    assert.equal(scene.selected, word.id)
    assert.equal(scene.selectedGroup, null)
  })

  test("copies from the last word", () => {
    const [a, b] = line(2, "a", "b")
    b.texture = "fired"
    b.spaceBefore = false
    setScene(a, b)
    addWord(a)
    assert.equal(scene.objects[2].texture, "fired")
    assert.equal(scene.objects[2].spaceBefore, true)
  })

  test("turns a single object into a line", () => {
    const [a] = setScene(createObject({ text: "a" }))
    addWord(a)
    assert.notEqual(a.group, null)
    assert.equal(scene.objects[1].group, a.group)
  })
})

describe("duplicateLine", () => {
  test("copies a single object and selects the copy", () => {
    const [a, b] = setScene(createObject({ text: "a", hue: 40 }), createObject({ text: "b" }))
    duplicateLine(a)
    assert.deepEqual(texts(), ["a", "a", "b"])
    const copy = scene.objects[1]
    assert.notEqual(copy.id, a.id)
    assert.equal(copy.group, null)
    assert.equal(copy.hue, 40)
    assert.equal(scene.selected, copy.id)
    assert.equal(scene.selectedGroup, null)
    assert.equal(scene.objects[2], b)
  })

  test("copies a whole line after its last word under a new group", () => {
    const [a, b] = line(4, "a", "b")
    const c = createObject({ text: "c" })
    setScene(a, b, c)
    duplicateLine(b)
    assert.deepEqual(texts(), ["a", "b", "a", "b", "c"])
    assert.equal(scene.objects[2].group, 5)
    assert.equal(scene.objects[3].group, 5)
    assert.equal(a.group, 4)
    assert.equal(b.group, 4)
    assert.equal(scene.selected, scene.objects[2].id)
    assert.equal(scene.selectedGroup, 5)
  })

  test("copies keep the same match reference", () => {
    const reference = createObject({ text: "r" })
    const target = createObject({ text: "t", matchWidth: reference.id })
    setScene(reference, target)
    duplicateLine(target)
    assert.equal(scene.objects[2].matchWidth, reference.id)
  })

  test("a copy does not share nested values with the original", () => {
    const [a] = setScene(createObject({ text: "a" }))
    duplicateLine(a)
    scene.objects[1].stops[0].colour = "#000000"
    assert.equal(a.stops[0].colour, "#FFCF76")
  })

  test("copies are protected from a texture reset", () => {
    const [a] = setScene(createObject({ text: "a" }))
    duplicateLine(a)
    assert.ok(keepTexture.has(scene.objects[1]))
  })
})

describe("chooseMatch", () => {
  function moved(values = {}) {
    return setScene(createObject({ text: "a" }), createObject({ text: "b", scaleX: 2, scaleY: 1.5, scaleZ: 3, translateX: 10, translateY: 4, translateZ: 5, rotationX: 20, ...values }))
  }

  test("resets X scale and X position and leaves everything else", () => {
    const [a, b] = moved()
    chooseMatch(b, a.id)
    assert.equal(b.matchWidth, a.id)
    assert.deepEqual([b.scaleX, b.translateX], [1, 0])
    assert.deepEqual([b.scaleY, b.scaleZ, b.translateY, b.translateZ, b.rotationX], [1.5, 3, 4, 5, 20])
  })

  test("also resets Y scale when Y is matched too", () => {
    const [a, b] = moved({ matchScaleY: true })
    chooseMatch(b, a.id)
    assert.equal(b.scaleY, 1)
  })

  test("linked sliders keep their ratio", () => {
    const [a, b] = moved({ linkScale: 0.75 })
    chooseMatch(b, a.id)
    assert.deepEqual([b.scaleX, b.scaleY, b.linkScale], [1, 0.75, 0.75])
  })

  test("linked sliders both go to 1 when Y is matched too", () => {
    const [a, b] = moved({ linkScale: 0.75, matchScaleY: true })
    chooseMatch(b, a.id)
    assert.deepEqual([b.scaleX, b.scaleY, b.linkScale], [1, 1, 1])
  })

  test("choosing None leaves the sliders alone", () => {
    const [a, b] = moved({ matchWidth: 1 })
    chooseMatch(b, null)
    assert.equal(a.matchWidth, null)
    assert.equal(b.matchWidth, null)
    assert.deepEqual([b.scaleX, b.translateX], [2, 10])
  })

  test("applies to every word in the line", () => {
    const [a, b, c] = setScene(createObject({ text: "a" }), createObject({ text: "b", group: 3, scaleX: 2 }), createObject({ text: "c", group: 3, scaleX: 2 }))
    chooseMatch(b, a.id)
    assert.deepEqual([b.matchWidth, c.matchWidth, b.scaleX, c.scaleX], [a.id, a.id, 1, 1])
  })
})

describe("bakeMatch", () => {
  test("moves the match into the sliders and unlinks", () => {
    const [a, b] = setScene(createObject({ text: "a" }), createObject({ text: "b" }))
    Object.assign(b, { matchWidth: a.id, matchBottom: true, matchScale: 2, matchOffset: -4, scaleX: 1.5, scaleY: 1.2, translateX: 10 })
    bakeMatch(b)
    assert.deepEqual([b.scaleX, b.scaleY, b.translateX], [3, 1.2, 6])
    assert.deepEqual([b.matchWidth, b.matchBottom, b.matchScale, b.matchOffset], [null, false, 1, 0])
  })

  test("takes Y along when it was matched too", () => {
    const [a, b] = setScene(createObject({ text: "a" }), createObject({ text: "b" }))
    Object.assign(b, { matchWidth: a.id, matchScaleY: true, matchScale: 2, scaleY: 1.5 })
    bakeMatch(b)
    assert.deepEqual([b.scaleX, b.scaleY, b.matchScaleY], [2, 3, false])
  })

  test("keeps linked sliders at their new ratio", () => {
    const [a, b] = setScene(createObject({ text: "a" }), createObject({ text: "b" }))
    Object.assign(b, { matchWidth: a.id, matchScale: 2, linkScale: 1, scaleX: 1, scaleY: 1 })
    bakeMatch(b)
    assert.equal(b.linkScale, 0.5)
  })

  test("bakes every word in the line", () => {
    const [a, b, c] = setScene(createObject({ text: "a" }), createObject({ text: "b", group: 3 }), createObject({ text: "c", group: 3 }))
    for (const word of [b, c]) Object.assign(word, { matchWidth: a.id, matchScale: 2 })
    bakeMatch(b)
    assert.deepEqual([b.scaleX, c.scaleX, b.matchWidth, c.matchWidth], [2, 2, null, null])
  })
})

describe("removeObject", () => {
  test("selects whatever took the removed object's place", () => {
    const [, b, c] = setScene(createObject({ text: "a" }), createObject({ text: "b" }), createObject({ text: "c" }))
    select(b)
    removeObject(b)
    assert.deepEqual(texts(), ["a", "c"])
    assert.equal(scene.selected, c.id)
  })

  test("selects the new last object when removing the last", () => {
    const [a, b] = setScene(createObject({ text: "a" }), createObject({ text: "b" }))
    select(b)
    removeObject(b)
    assert.equal(scene.selected, a.id)
  })

  test("keeps the selection when another object is removed", () => {
    const [a, b] = setScene(createObject({ text: "a" }), createObject({ text: "b" }))
    select(a)
    removeObject(b)
    assert.equal(scene.selected, a.id)
  })

  test("selects the previous word of the same line", () => {
    const [a, b, c] = line(1, "a", "b", "c")
    setScene(a, b, c)
    select(c)
    removeObject(c)
    assert.equal(scene.selected, b.id)
  })

  test("selects the next word when removing the first", () => {
    const [a, b, c] = line(1, "a", "b", "c")
    setScene(createObject({ text: "before" }), a, b, c)
    select(a)
    removeObject(a)
    assert.equal(scene.selected, b.id)
  })

  test("keeps the group of the words that remain", () => {
    const [a, b, c] = line(1, "a", "b", "c")
    setScene(a, b, c)
    removeObject(b)
    assert.equal(a.group, 1)
    assert.equal(c.group, 1)
  })

  test("ungroups the last word left in a line", () => {
    const [a, b] = line(1, "a", "b")
    setScene(a, b)
    select(a)
    removeObject(a)
    assert.equal(b.group, null)
    assert.equal(scene.selected, b.id)
  })

  test("removing the line a match points at bakes the match, so nothing moves", () => {
    const [a, b] = setScene(createObject({ text: "a" }), createObject({ text: "b" }))
    Object.assign(b, { matchWidth: a.id, matchScale: 2, matchOffset: 3, matchScaleY: true, scaleX: 1.5, scaleY: 1.2 })
    removeObject(a)
    assert.equal(b.matchWidth, null)
    assert.equal(b.scaleX, 3)
    assert.equal(b.scaleY, 2.4)
    assert.equal(b.translateX, 3)
    assert.equal(b.matchScale, 1)
    assert.equal(b.matchOffset, 0)
  })

  test("clears match references to the removed object", () => {
    const [a, b, c] = setScene(createObject({ text: "a" }), createObject({ text: "b" }), createObject({ text: "c" }))
    b.matchWidth = a.id
    c.matchWidth = b.id
    removeObject(a)
    assert.equal(b.matchWidth, null)
    assert.equal(c.matchWidth, b.id)
  })

  test("forgets the removed object's runtime", () => {
    const [a, b] = setScene(createObject({ text: "a" }), createObject({ text: "b" }))
    runtime[a.id] = { built: true }
    runtime[b.id] = { built: true }
    removeObject(a)
    assert.equal(a.id in runtime, false)
    assert.equal(b.id in runtime, true)
    delete runtime[b.id]
  })

  test("keeps a selected group when one of its words goes", () => {
    const [a, b, c] = line(1, "a", "b", "c")
    setScene(a, b, c)
    selectGroup(1)
    removeObject(a)
    assert.equal(scene.selectedGroup, 1)
    assert.equal(scene.selected, b.id)
  })

  test("clears a selected group when it stops being a group", () => {
    const [a, b] = line(1, "a", "b")
    setScene(a, b)
    selectGroup(1)
    removeObject(a)
    assert.equal(scene.selectedGroup, null)
    assert.equal(scene.selected, b.id)
  })

  test("removing the only object leaves nothing selected", () => {
    const [a] = setScene(createObject({ text: "a" }))
    removeObject(a)
    assert.deepEqual(scene.objects, [])
    assert.equal(scene.selected, null)
    assert.equal(scene.selectedGroup, null)
  })
})

describe("removeLine", () => {
  test("removes every word of the line", () => {
    const [a, b] = line(1, "a", "b")
    const c = createObject({ text: "c" })
    setScene(a, b, c)
    removeLine(b)
    assert.deepEqual(texts(), ["c"])
    assert.equal(scene.selected, c.id)
    assert.equal(scene.selectedGroup, null)
  })

  test("clears references to the line", () => {
    const [a, b] = line(1, "a", "b")
    const c = createObject({ text: "c", matchWidth: a.id })
    setScene(a, b, c)
    removeLine(a)
    assert.equal(c.matchWidth, null)
  })

  test("leaves another line's group and selection alone", () => {
    const [a, b] = line(1, "a", "b")
    const [c, d] = line(2, "c", "d")
    setScene(a, b, c, d)
    selectGroup(2)
    removeLine(a)
    assert.equal(c.group, 2)
    assert.equal(d.group, 2)
    assert.equal(scene.selectedGroup, 2)
    assert.equal(scene.selected, c.id)
  })

  test("selects what takes the line's place", () => {
    const first = createObject({ text: "first" })
    const [a, b] = line(1, "a", "b")
    const last = createObject({ text: "last" })
    setScene(first, a, b, last)
    selectGroup(1)
    removeLine(a)
    assert.equal(scene.selected, last.id)
    assert.equal(scene.selectedGroup, null)
  })

  test("removing the last line leaves nothing selected", () => {
    const [a, b] = line(1, "a", "b")
    setScene(a, b)
    removeLine(a)
    assert.equal(scene.objects.length, 0)
    assert.equal(scene.selected, null)
  })
})

describe("titleFileName", () => {
  test("lowercases and joins with underscores", () => {
    setScene(createObject({ text: "Hello World" }), createObject({ text: "Again" }))
    assert.equal(titleFileName(), "hello_world_again")
  })

  test("skips hidden objects", () => {
    setScene(createObject({ text: "shown" }), createObject({ text: "secret", hidden: true }), createObject({ text: "too" }))
    assert.equal(titleFileName(), "shown_too")
  })

  test("joins words without a space in the same line", () => {
    const [a, b, c] = line(1, "one", "two", "three")
    b.spaceBefore = false
    setScene(a, b, c)
    assert.equal(titleFileName(), "onetwo_three")
  })

  test("separates different lines even without a space", () => {
    const [a] = line(1, "one")
    const [b] = line(2, "two")
    b.spaceBefore = false
    setScene(a, b)
    assert.equal(titleFileName(), "one_two")
  })

  test("replaces characters Windows does not allow", () => {
    setScene(createObject({ text: "a\\b/c:d*e?f\"g<h>i|j" }))
    assert.equal(titleFileName(), "a_b_c_d_e_f_g_h_i_j")
  })

  test("strips leading and trailing dots and underscores", () => {
    setScene(createObject({ text: "..hello.." }))
    assert.equal(titleFileName(), "hello")
    setScene(createObject({ text: "// hello //" }))
    assert.equal(titleFileName(), "hello")
  })

  test("falls back to title when nothing is left", () => {
    setScene(createObject({ text: "   " }))
    assert.equal(titleFileName(), "title")
    setScene(createObject({ text: "...///" }))
    assert.equal(titleFileName(), "title")
    setScene(createObject({ text: "gone", hidden: true }))
    assert.equal(titleFileName(), "title")
    setScene()
    assert.equal(titleFileName(), "title")
  })

  test("limits the name to 64 characters", () => {
    setScene(createObject({ text: "a".repeat(100) }))
    assert.equal(titleFileName(), "a".repeat(64))
  })

  test("does not end on a separator after cutting", () => {
    setScene(createObject({ text: `${"a".repeat(63)} bbb` }))
    assert.equal(titleFileName(), "a".repeat(63))
  })

  test("does not cut through a surrogate pair", () => {
    setScene(createObject({ text: "\u{1F600}".repeat(70) }))
    assert.equal(titleFileName(), "\u{1F600}".repeat(64))
  })
})

describe("selecting", () => {
  test("select picks one word and clears the group", () => {
    const [a, b] = line(1, "a", "b")
    setScene(a, b)
    selectGroup(1)
    select(b)
    assert.equal(scene.selected, b.id)
    assert.equal(scene.selectedGroup, null)
    assert.deepEqual(selection.value, [b])
  })

  test("selectGroup picks the first word and every word is selected", () => {
    const [a, b] = line(1, "a", "b")
    const c = createObject({ text: "c" })
    setScene(c, a, b)
    selectGroup(1)
    assert.equal(scene.selected, a.id)
    assert.equal(scene.selectedGroup, 1)
    assert.deepEqual(selection.value, [a, b])
  })

  test("currentWord falls back to the first object", () => {
    const [a] = setScene(createObject({ text: "a" }))
    scene.selected = 999999
    assert.equal(currentWord.value, a)
  })
})

describe("addObject", () => {
  test("the second object in a top-only title becomes update text", () => {
    setScene(createObject({ text: "a" }))
    addObject()
    const object = scene.objects[1]
    assert.equal(object.text, "text")
    assert.equal(object.type, "bottom")
    assert.equal(object.fade, true)
    assert.equal(object.outerFade, 50)
    assert.equal(scene.selected, object.id)
  })

  test("further objects stay top text", () => {
    setScene(createObject({ text: "a" }), createObject({ text: "b" }))
    addObject()
    assert.equal(scene.objects[2].type, "top")
  })

  test("an object added to a non-top title stays top text", () => {
    setScene(createObject({ ...typeDefaults("small"), text: "a" }))
    addObject()
    assert.equal(scene.objects[1].type, "top")
  })
})

describe("hiding lines", () => {
  test("toggleLine hides and shows every word", () => {
    const [a, b] = line(1, "a", "b")
    setScene(a, b)
    toggleLine(a)
    assert.equal(a.hidden, true)
    assert.equal(b.hidden, true)
    assert.equal(lineHidden(b), true)
    toggleLine(b)
    assert.equal(a.hidden, false)
    assert.equal(b.hidden, false)
  })

  test("a partly hidden line counts as visible and toggles to hidden", () => {
    const [a, b] = line(1, "a", "b")
    b.hidden = true
    setScene(a, b)
    assert.equal(lineHidden(a), false)
    toggleLine(a)
    assert.equal(a.hidden, true)
    assert.equal(b.hidden, true)
  })
})

describe("current", () => {
  test("is the plain object for an ungrouped selection", () => {
    const [a] = setScene(createObject({ text: "a" }))
    assert.equal(current.value, a)
  })

  test("with one word selected, line settings reach every word", () => {
    const [a, b] = line(1, "a", "b")
    setScene(a, b)
    select(a)
    current.value.depth = 30
    assert.equal(a.depth, 30)
    assert.equal(b.depth, 30)
  })

  test("with one word selected, word settings stay on that word", () => {
    const [a, b] = line(1, "a", "b")
    setScene(a, b)
    select(a)
    current.value.hue = 40
    assert.equal(a.hue, 40)
    assert.equal(b.hue, 0)
  })

  test("with the line selected, settings reach every word", () => {
    const [a, b] = line(1, "a", "b")
    setScene(a, b)
    selectGroup(1)
    current.value.hue = 40
    assert.equal(a.hue, 40)
    assert.equal(b.hue, 40)
  })

  test("with the line selected, the text stays on the one word", () => {
    const [a, b] = line(1, "a", "b")
    setScene(a, b)
    selectGroup(1)
    current.value.text = "changed"
    assert.equal(a.text, "changed")
    assert.equal(b.text, "b")
  })

  test("nested changes reach every word without sharing", () => {
    const [a, b] = line(1, "a", "b")
    setScene(a, b)
    selectGroup(1)
    current.value.stops[0].colour = "#000000"
    assert.equal(b.stops[0].colour, "#000000")
    b.stops[0].colour = "#111111"
    assert.equal(a.stops[0].colour, "#000000")
  })

  test("array changes reach every word", () => {
    const [a, b] = line(1, "a", "b")
    setScene(a, b)
    selectGroup(1)
    current.value.overlays.push({ overlay: "dust" })
    assert.deepEqual(snapshot(a).overlays, [{ overlay: "dust" }])
    assert.deepEqual(snapshot(b).overlays, [{ overlay: "dust" }])
    current.value.overlays.splice(0, 1)
    assert.deepEqual(snapshot(b).overlays, [])
  })

  test("reads through to the word", () => {
    const [a, b] = line(1, "a", "b")
    a.hue = 12
    setScene(a, b)
    select(a)
    assert.equal(current.value.hue, 12)
    assert.equal(current.value.text, "a")
  })
})

describe("word tabs", () => {
  test("are off for a plain single object", () => {
    setScene(createObject({ text: "a" }))
    assert.equal(wordTabs.value, false)
  })

  test("are on for a multi-word line", () => {
    const [a, b] = line(1, "a", "b")
    setScene(a, b)
    assert.equal(wordTabs.value, true)
  })

  test("stay on for a single object with word settings", () => {
    setScene(createObject({ text: "a", wordScaleX: 2 }))
    assert.equal(wordTabs.value, true)
  })

  test("shapingWord needs both the tabs and the word tab open", () => {
    const [a, b] = line(1, "a", "b")
    setScene(a, b)
    view.shapeTab = "line"
    assert.equal(shapingWord.value, false)
    view.shapeTab = "word"
    assert.equal(shapingWord.value, true)
    setScene(createObject())
    assert.equal(shapingWord.value, false)
    view.shapeTab = "line"
  })
})

describe("autosave", () => {
  test("writes the scene after the settle time", async () => {
    const [a] = setScene(createObject({ text: "first" }))
    await nextTick()
    mock.timers.tick(300)
    store.delete("minecraft-title-scene")
    a.text = "saved"
    await nextTick()
    mock.timers.tick(299)
    assert.equal(store.has("minecraft-title-scene"), false)
    mock.timers.tick(1)
    assert.deepEqual(JSON.parse(store.get("minecraft-title-scene")), { version: FILE_VERSION, lines: [{ text: "saved" }], selected: 0, selectedGroup: null })
  })

  test("stores the selection by position", async () => {
    const [, , c] = setScene(createObject({ text: "one" }), ...line(4, "two", "three"))
    select(c)
    scene.selectedGroup = 4
    await nextTick()
    mock.timers.tick(300)
    const saved = JSON.parse(store.get("minecraft-title-scene"))
    assert.equal(saved.selected, 2)
    assert.equal(saved.selectedGroup, 1)
  })

  test("writes what a line's words share once", async () => {
    const customFont = { kind: "ascii", fileName: "ascii.png", data: "data:image/png;base64,FONT", height: 40, lowercase: false }
    const shared = { font: "custom-abc", customFont, textureSource: "custom", customTexture: "data:image/png;base64,TEXTURE" }
    setScene(...["a", "b", "c"].map(text => createObject({ ...shared, text, group: 2 })))
    await nextTick()
    mock.timers.tick(300)
    const text = store.get("minecraft-title-scene")
    assert.equal(text.split("base64,FONT").length, 2)
    assert.equal(text.split("base64,TEXTURE").length, 2)
    assert.deepEqual(JSON.parse(text).lines[0].words, [{ text: "a" }, { text: "b" }, { text: "c" }])
  })

  test("keeps the settings of tabs that aren't in use", async () => {
    setScene(createObject({ text: "kept", textureSource: "gradient", texture: "cracked", tileableScale: 4 }))
    await nextTick()
    mock.timers.tick(300)
    assert.deepEqual(JSON.parse(store.get("minecraft-title-scene")).lines, [{ text: "kept", textureSource: "gradient", texture: "cracked", tileableScale: 4 }])
  })

  test("reports a failed write and clears it after the next success", async () => {
    const [a] = setScene(createObject({ text: "first" }))
    await nextTick()
    failWrites = true
    a.text = "fails"
    await nextTick()
    mock.timers.tick(300)
    failWrites = false
    assert.equal(saveError.value, "Your title couldn't be saved, so changes will be lost if you reload: quota exceeded")
    a.text = "works"
    await nextTick()
    mock.timers.tick(300)
    assert.equal(saveError.value, null)
  })
})

describe("restoring the saved scene", () => {
  async function loadWith(saved, tag) {
    store.set("minecraft-title-scene", saved)
    const module = await import(`../src/lib/scene.js?${tag}`)
    store.delete("minecraft-title-scene")
    return module
  }

  test("brings back the title and its selection", async () => {
    const reference = createObject({ text: "one", hue: 30 })
    const [b, c] = line(3, "two", "three")
    b.matchWidth = c.matchWidth = reference.id
    setScene(reference, b, c)
    select(c)
    scene.selectedGroup = 3
    await nextTick()
    mock.timers.tick(300)
    const module = await loadWith(store.get("minecraft-title-scene"), "restore")
    const [first, second, third] = module.scene.objects
    assert.deepEqual(module.scene.objects.map(object => object.text), ["one", "two", "three"])
    assert.equal(first.hue, 30)
    assert.equal(first.group, null)
    assert.ok(second.group !== null && second.group === third.group)
    assert.deepEqual([second.matchWidth, third.matchWidth], [first.id, first.id])
    assert.equal(module.scene.selected, third.id)
    assert.equal(module.scene.selectedGroup, third.group)
    assert.ok(module.keepTexture.has(first))
    assert.equal(module.saveError.value, null)
  })

  test("brings back uploads and the settings of tabs that aren't in use", async () => {
    const customFont = { kind: "ascii", fileName: "ascii.png", data: "data:image/png;base64,FONT", height: 40, lowercase: false }
    const shared = { font: "custom-abc", customFont, textureSource: "custom", customTexture: "data:image/png;base64,TEXTURE", texture: "cracked", group: 2 }
    setScene(createObject({ ...shared, text: "a" }), createObject({ ...shared, text: "b", hue: 20 }))
    await nextTick()
    mock.timers.tick(300)
    const module = await loadWith(store.get("minecraft-title-scene"), "uploads")
    assert.deepEqual(module.scene.objects.map(object => snapshot(object)), scene.objects.map(object => ({ ...snapshot(object), group: module.scene.objects[0].group })))
  })

  test("runs a scene stored by an older version through the file upgrades", async () => {
    const module = await loadWith(JSON.stringify({ version: 3, lines: [{ text: "serif", font: "block-serif", spacing: 1, depth: 30 }], selected: 0, selectedGroup: null }), "upgrade")
    assert.equal(module.scene.objects[0].spacing, 3)
    assert.equal(module.scene.objects[0].depthAnchor, "front")
  })

  test("says why a stored scene could not be brought back", async () => {
    const module = await loadWith(JSON.stringify({ version: FILE_VERSION + 1, lines: [{ text: "newer" }] }), "newer")
    assert.equal(module.scene.objects[0].text, "Minecraft")
    assert.equal(module.saveError.value, `Your last title couldn't be restored: it was saved by a newer version of the generator (format ${FILE_VERSION + 1})`)
  })

  describe("stored before scenes had a version", () => {
    test("brings back objects and selection", async () => {
      const saved = { objects: [{ id: 7001, text: "one", hue: 30 }, { id: 7002, text: "two", group: 3, matchWidth: 7001 }, { id: 7003, text: "three", group: 3, matchWidth: 7001 }], selected: 7002, selectedGroup: 3 }
      const module = await loadWith(JSON.stringify(saved), "legacy")
      const [first, second, third] = module.scene.objects
      assert.deepEqual(module.scene.objects.map(object => object.text), ["one", "two", "three"])
      assert.equal(first.hue, 30)
      assert.ok(second.group !== null && second.group === third.group)
      assert.deepEqual([second.matchWidth, third.matchWidth], [first.id, first.id])
      assert.equal(module.scene.selected, second.id)
      assert.equal(module.scene.selectedGroup, second.group)
      assert.ok(module.keepTexture.has(first))
    })

    test("keeps separate lines that have no group apart", async () => {
      const module = await loadWith(JSON.stringify({ objects: [{ id: 7401, text: "one" }, { id: 7402, text: "two" }] }), "ungrouped")
      assert.deepEqual(module.scene.objects.map(object => object.group), [null, null])
    })

    test("is read as version 4, so only the depth anchor is upgraded", async () => {
      const old = { id: 7501, text: "old", font: "block-serif", spacing: 1, depth: 22, matchWidth: null, scaleX: 1.5 }
      const current = { id: 7502, text: "current", depthAnchor: "back" }
      const update = { id: 7503, text: "update", type: "bottom" }
      const module = await loadWith(JSON.stringify({ objects: [old, current, update] }), "version")
      assert.deepEqual(module.scene.objects.map(object => object.depthAnchor), ["front", "back", "front"])
      assert.equal(module.scene.objects[0].spacing, 1)
      assert.equal(module.scene.objects[0].scaleX, 1.5)
    })

    test("turns a twist anchor into its centre", async () => {
      const module = await loadWith(JSON.stringify({ objects: [{ id: 7601, text: "twist", twistRibbon: 30, twistRibbonAnchor: "right" }] }), "twist")
      assert.equal(module.scene.objects[0].twistRibbonCentre, 100)
      assert.equal(module.scene.objects[0].twistRibbonMirror, true)
    })
  })

  test("fixes a selection that no longer exists", async () => {
    const module = await loadWith(JSON.stringify({ version: FILE_VERSION, lines: [{ text: "one" }], selected: 5, selectedGroup: 2 }), "stale")
    assert.equal(module.scene.selected, module.scene.objects[0].id)
    assert.equal(module.scene.selectedGroup, null)
  })

  test("keeps blank words when some text remains", async () => {
    const module = await loadWith(JSON.stringify({ objects: [{ id: 7201, text: " " }, { id: 7202, text: "x" }] }), "blank")
    assert.equal(module.scene.objects.length, 2)
  })

  test("starts fresh when every word is blank", async () => {
    const module = await loadWith(JSON.stringify({ objects: [{ id: 7301, text: "  " }] }), "empty")
    assert.equal(module.scene.objects.length, 1)
    assert.equal(module.scene.objects[0].text, "Minecraft")
  })

  test("starts fresh from broken JSON", async () => {
    const module = await loadWith("{ nope", "broken")
    assert.equal(module.scene.objects.length, 1)
    assert.equal(module.scene.objects[0].text, "Minecraft")
  })

  test("starts fresh when nothing is saved", async () => {
    const module = await import("../src/lib/scene.js?nothing")
    assert.equal(module.scene.objects.length, 1)
    assert.equal(module.scene.selected, module.scene.objects[0].id)
  })
})

describe("removing a word from a line another line matches", () => {
  test("the match follows the first word", () => {
    const [a, b, c] = line(1, "a", "b", "c")
    const d = createObject({ text: "d", matchWidth: a.id })
    setScene(a, b, c, d)
    removeObject(a)
    assert.equal(d.matchWidth, b.id)
  })

  test("the match survives the line becoming one word", () => {
    const [a, b] = line(1, "a", "b")
    const c = createObject({ text: "c", matchWidth: a.id })
    setScene(a, b, c)
    removeObject(a)
    assert.equal(b.group, null)
    assert.equal(c.matchWidth, b.id)
  })

  test("removing a later word changes nothing", () => {
    const [a, b, c] = line(1, "a", "b", "c")
    const d = createObject({ text: "d", matchWidth: a.id })
    setScene(a, b, c, d)
    removeObject(b)
    assert.equal(d.matchWidth, a.id)
  })

  test("removing the whole line clears the match", () => {
    const [a, b] = line(1, "a", "b")
    const c = createObject({ text: "c", matchWidth: a.id })
    setScene(a, b, c)
    removeLine(a)
    assert.equal(c.matchWidth, null)
  })
})
