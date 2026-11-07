import { describe, test } from "node:test"
import assert from "node:assert/strict"

let response = null
const requests = []

function stubFetch(url, options) {
  requests.push({ url, options })
  return Promise.resolve(response)
}

globalThis.localStorage = { getItem: () => null, setItem: () => {} }
globalThis.fetch = stubFetch

const { loadStats, popular } = await import("../src/lib/stats.js")

function statsOf(entries) {
  return { ok: true, status: 200, json: async () => entries }
}

const idOf = entry => entry.id

function ids(entries) {
  return entries.map(idOf)
}

describe("popular", () => {
  const entries = [{ id: "a" }, { id: "b" }, { id: "c" }]

  test("is alphabetical before stats have loaded", () => {
    assert.deepEqual(ids(popular(entries.slice().reverse(), idOf, idOf)), ["a", "b", "c"])
  })

  test("sorts by count, highest first", async () => {
    response = statsOf([{ id: "a", count: 1 }, { id: "b", count: 5 }, { id: "c", count: 3 }])
    await loadStats()
    assert.deepEqual(ids(popular(entries, idOf, idOf)), ["b", "c", "a"])
  })

  test("puts pinned entries first in the order given, ignoring their counts", async () => {
    response = statsOf([{ id: "a", count: 1 }, { id: "b", count: 5 }, { id: "c", count: 3 }, { id: "d", count: 9 }])
    await loadStats()
    assert.deepEqual(ids(popular(entries.concat({ id: "d" }), idOf, idOf, ["c", "a"])), ["c", "a", "d", "b"])
  })

  test("ignores pinned ids that are not in the list", async () => {
    response = statsOf([{ id: "a", count: 1 }, { id: "b", count: 5 }])
    await loadStats()
    assert.deepEqual(ids(popular(entries, idOf, idOf, ["missing"])), ["b", "a", "c"])
  })

  test("counts an unknown id as zero", async () => {
    response = statsOf([{ id: "c", count: 2 }])
    await loadStats()
    assert.deepEqual(ids(popular(entries, idOf, idOf)), ["c", "a", "b"])
  })

  test("sorts ties alphabetically by the shown name, whatever their ids", async () => {
    response = statsOf([{ id: "a", count: 4 }, { id: "b", count: 7 }, { id: "c", count: 4 }, { id: "d", count: 4 }])
    await loadStats()
    const list = [{ id: "a", name: "stone" }, { id: "b", name: "Zinc" }, { id: "c", name: "Gold" }, { id: "d", name: "Amber" }]
    assert.deepEqual(ids(popular(list, idOf, entry => entry.name)), ["b", "d", "c", "a"])
  })

  test("does not change the list it was given", async () => {
    response = statsOf([{ id: "c", count: 9 }])
    await loadStats()
    const list = [{ id: "a" }, { id: "c" }]
    assert.deepEqual(ids(popular(list, idOf, idOf)), ["c", "a"])
    assert.deepEqual(ids(list), ["a", "c"])
  })

  test("works out ids through the given function", async () => {
    response = statsOf([{ id: "font.stone", count: 2 }, { id: "font.gold", count: 8 }])
    await loadStats()
    const sorted = popular(Object.entries({ stone: { name: "Stone" }, gold: { name: "Gold" } }), ([id]) => `font.${id}`, ([, data]) => data.name)
    assert.deepEqual(sorted.map(([id]) => id), ["gold", "stone"])
  })

  test("a failed load keeps the earlier counts", async () => {
    response = statsOf([{ id: "b", count: 5 }])
    await loadStats()
    response = { ok: false, status: 503 }
    await assert.rejects(loadStats(), { message: "failed to load the title stats: 503" })
    assert.deepEqual(ids(popular(entries, idOf, idOf)), ["b", "a", "c"])
  })
})
