import { beforeEach, describe, mock, test } from "node:test"
import assert from "node:assert/strict"

const stored = new Map()
const requests = []
let replies = {}

globalThis.localStorage = { getItem: key => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value) }
globalThis.fetch = async (url, options) => {
  const method = options?.method ?? "GET"
  requests.push(`${method} ${url}`)
  const reply = replies[`${method} ${url}`] ?? replies[method]
  if (!reply) throw new Error(`no reply set for ${method} ${url}`)
  return { ok: (reply.status ?? 200) < 400, status: reply.status ?? 200, json: async () => reply.body }
}

mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-11-05T12:00:00Z") })

async function fresh() {
  return await import(`../src/lib/community.js?run=${Math.random()}`)
}

function page(ids, more = false) {
  return { body: { presets: ids.map(id => ({ id, name: `Preset ${id}`, votes: 0, rating: null, downloads: 0 })), more } }
}

const POPULAR = { sort: "popular", search: "", offset: 0 }

beforeEach(() => {
  stored.clear()
  requests.length = 0
  replies = {}
  mock.timers.setTime(Date.parse("2026-11-05T12:00:00Z"))
})

describe("list pages", () => {
  test("a repeat view makes no request", async () => {
    replies.GET = page([1, 2])
    const { listCommunity } = await fresh()
    await listCommunity(POPULAR)
    const again = await listCommunity(POPULAR)
    assert.equal(requests.length, 1)
    assert.deepEqual(again.presets.map(preset => preset.id), [1, 2])
  })

  test("survives a reload", async () => {
    replies.GET = page([1])
    await (await fresh()).listCommunity(POPULAR)
    const { listCommunity } = await fresh()
    await listCommunity(POPULAR)
    assert.equal(requests.length, 1)
  })

  test("fetches again after 30 minutes", async () => {
    replies.GET = page([1])
    const { listCommunity } = await fresh()
    await listCommunity(POPULAR)
    mock.timers.setTime(Date.now() + 29 * 60000)
    await listCommunity(POPULAR)
    assert.equal(requests.length, 1)
    mock.timers.setTime(Date.now() + 2 * 60000)
    await listCommunity(POPULAR)
    assert.equal(requests.length, 2)
  })

  test("sort, search and page are cached apart", async () => {
    replies.GET = page([1])
    const { listCommunity } = await fresh()
    await listCommunity(POPULAR)
    await listCommunity({ ...POPULAR, sort: "top" })
    await listCommunity({ ...POPULAR, search: "stone" })
    await listCommunity({ ...POPULAR, offset: 24 })
    assert.equal(requests.length, 4)
  })

  test("search ignores case and spaces when reusing a page", async () => {
    replies.GET = page([1])
    const { listCommunity } = await fresh()
    await listCommunity({ ...POPULAR, search: "stone" })
    await listCommunity({ ...POPULAR, search: "  STONE " })
    assert.equal(requests.length, 1)
  })

  test("reports where the next page starts from what the server sent", async () => {
    replies.GET = page([1, 2, 3], true)
    const { listCommunity, voteOn } = await fresh()
    replies.POST = { body: { votes: 1, rating: null, vote: 1 } }
    await voteOn(2, 1)
    const { presets, next, more } = await listCommunity({ sort: "needs", search: "", offset: 0 })
    assert.deepEqual(presets.map(preset => preset.id), [1, 3])
    assert.equal(next, 3)
    assert.equal(more, true)
  })

  test("a failed request isn't cached", async () => {
    replies.GET = { status: 500, body: { error: "broken" } }
    const { listCommunity } = await fresh()
    await assert.rejects(listCommunity(POPULAR), /broken/)
    replies.GET = page([1])
    assert.equal((await listCommunity(POPULAR)).presets.length, 1)
  })

  test("keeps the newest 60 pages", async () => {
    replies.GET = page([1])
    const { listCommunity } = await fresh()
    for (let index = 0; index < 70; index++) {
      mock.timers.setTime(Date.now() + 1000)
      await listCommunity({ ...POPULAR, search: `term ${index}` })
    }
    const pages = Object.keys(JSON.parse(stored.get("minecraft-title-community")).pages)
    assert.equal(pages.length, 60)
    assert.ok(pages.includes("popular|term 69|0"))
    assert.equal(pages.includes("popular|term 0|0"), false)
  })

  test("carries on when the browser's storage is full", async () => {
    replies.GET = page([1])
    const { listCommunity } = await fresh()
    const setItem = localStorage.setItem
    const logged = mock.method(console, "error", () => {})
    localStorage.setItem = () => {
      throw new Error("full")
    }
    assert.equal((await listCommunity(POPULAR)).presets.length, 1)
    localStorage.setItem = setItem
    logged.mock.restore()
  })
})

describe("votes", () => {
  test("are remembered in the browser and survive a reload", async () => {
    replies.GET = page([1, 2])
    replies.POST = { body: { votes: 1, rating: null, vote: -1 } }
    const first = await fresh()
    await first.voteOn(1, -1)
    const { presets } = await (await fresh()).listCommunity(POPULAR)
    assert.deepEqual(presets.map(preset => preset.vote), [-1, 0])
  })

  test("show your numbers without a fetch", async () => {
    replies.GET = page([1])
    replies.POST = { body: { votes: 5, rating: 4, vote: 1 } }
    const { listCommunity, voteOn } = await fresh()
    await listCommunity(POPULAR)
    await voteOn(1, 1)
    const { presets } = await listCommunity(POPULAR)
    assert.deepEqual([presets[0].votes, presets[0].rating, presets[0].vote], [5, 4, 1])
    assert.equal(requests.filter(item => item.startsWith("GET")).length, 1)
  })

  test("presets you shared are marked as yours, even after a reload", async () => {
    replies.GET = page([1, 2])
    replies.POST = { body: { preset: { id: 2 } } }
    const first = await fresh()
    await first.sharePublicly("code", "name")
    const { presets } = await (await fresh()).listCommunity(POPULAR)
    assert.deepEqual(presets.map(preset => preset.own), [false, true])
  })

  test("a preset the server says is yours is remembered", async () => {
    replies.GET = page([1])
    replies.POST = { status: 403, body: { error: "yours" } }
    const { listCommunity, voteOn } = await fresh()
    await assert.rejects(voteOn(1, 1), /yours/)
    assert.equal((await listCommunity(POPULAR)).presets[0].own, true)
  })

  test("switching replaces the remembered vote", async () => {
    replies.GET = page([1])
    replies.POST = { body: { votes: 1, rating: null, vote: 1 } }
    const { listCommunity, voteOn } = await fresh()
    await voteOn(1, 1)
    replies.POST = { body: { votes: 1, rating: null, vote: -1 } }
    await voteOn(1, -1)
    assert.equal((await listCommunity(POPULAR)).presets[0].vote, -1)
  })

  test("a refused vote isn't remembered", async () => {
    replies.GET = page([1])
    replies.POST = { status: 500, body: { error: "broken" } }
    const { listCommunity, voteOn } = await fresh()
    await assert.rejects(voteOn(1, 1), /broken/)
    assert.equal((await listCommunity(POPULAR)).presets[0].vote, 0)
  })
})

describe("downloads", () => {
  test("are only sent once per preset, even after a reload", async () => {
    replies.POST = { body: { counted: true } }
    const first = await fresh()
    await first.countDownload({ id: 5, downloads: 0 })
    await first.countDownload({ id: 5, downloads: 0 })
    await (await fresh()).countDownload({ id: 5, downloads: 0 })
    assert.equal(requests.length, 1)
    await first.countDownload({ id: 6, downloads: 0 })
    assert.equal(requests.length, 2)
  })

  test("are tried again later if sending fails", async () => {
    replies.POST = { status: 500, body: {} }
    const { countDownload } = await fresh()
    await assert.rejects(countDownload({ id: 5, downloads: 0 }))
    replies.POST = { body: { counted: true } }
    await countDownload({ id: 5, downloads: 0 })
    assert.equal(requests.length, 2)
  })
})

describe("your own changes", () => {
  const MINUTE = 60000
  const VOTED = { body: { votes: 5, rating: 4, vote: 1 } }

  test("a vote stays over an older list after a reload", async () => {
    replies.GET = page([1])
    replies.POST = VOTED
    const first = await fresh()
    await first.listCommunity(POPULAR)
    await first.voteOn(1, 1)
    mock.timers.setTime(Date.now() + 31 * MINUTE)
    const { presets } = await (await fresh()).listCommunity(POPULAR)
    assert.equal(requests.filter(item => item.startsWith("GET")).length, 2)
    assert.deepEqual([presets[0].votes, presets[0].rating, presets[0].vote], [5, 4, 1])
  })

  test("a vote shows in a list you had not opened yet", async () => {
    replies.GET = page([1])
    replies.POST = VOTED
    const { listCommunity, voteOn } = await fresh()
    await voteOn(1, 1)
    assert.equal((await listCommunity({ ...POPULAR, sort: "new" })).presets[0].votes, 5)
  })

  test("a vote shows in the random batch", async () => {
    replies.GET = page([1])
    replies.POST = VOTED
    const { listCommunity, voteOn } = await fresh()
    await listCommunity({ ...POPULAR, sort: "random" })
    await voteOn(1, 1)
    assert.equal((await listCommunity({ ...POPULAR, sort: "random" })).presets[0].votes, 5)
  })

  test("a list with more votes than you saw is newer, so it wins", async () => {
    replies.POST = VOTED
    const { listCommunity, voteOn } = await fresh()
    await voteOn(1, 1)
    replies.GET = { body: { presets: [{ id: 1, votes: 6, rating: 3, downloads: 0 }], more: false } }
    const { presets } = await listCommunity(POPULAR)
    assert.deepEqual([presets[0].votes, presets[0].rating, presets[0].vote], [6, 3, 1])
  })

  test("switching uses the new rating even with the same vote count", async () => {
    replies.POST = { body: { votes: 5, rating: 4, vote: -1 } }
    const { listCommunity, voteOn } = await fresh()
    await voteOn(1, -1)
    replies.GET = { body: { presets: [{ id: 1, votes: 5, rating: 5, downloads: 0 }], more: false } }
    assert.equal((await listCommunity(POPULAR)).presets[0].rating, 4)
  })

  test("the list is trusted again after an hour, and the change is forgotten", async () => {
    replies.GET = page([1])
    replies.POST = VOTED
    const { listCommunity, voteOn } = await fresh()
    await voteOn(1, 1)
    mock.timers.setTime(Date.now() + 61 * MINUTE)
    const { presets } = await listCommunity(POPULAR)
    assert.equal(presets[0].votes, 0)
    assert.equal(presets[0].vote, 1)
    assert.deepEqual(JSON.parse(stored.get("minecraft-title-community")).changes, {})
  })

  test("a download raises the count on the card", async () => {
    replies.POST = { body: { counted: true } }
    const { countDownload } = await fresh()
    assert.deepEqual(await countDownload({ id: 1, downloads: 4 }), { downloads: 5 })
  })

  test("a download raises the 7 day count when the card has one", async () => {
    replies.POST = { body: { counted: true } }
    const { countDownload } = await fresh()
    assert.deepEqual(await countDownload({ id: 1, downloads: 4, week: 2 }), { downloads: 5, week: 3 })
  })

  test("a download stays over an older list after a reload, in both counts", async () => {
    replies.POST = { body: { counted: true } }
    await (await fresh()).countDownload({ id: 1, downloads: 4, week: 2 })
    replies.GET = { body: { presets: [{ id: 1, votes: 0, rating: null, downloads: 4, week: 2 }], more: false } }
    const { presets } = await (await fresh()).listCommunity({ ...POPULAR, sort: "week" })
    assert.deepEqual([presets[0].downloads, presets[0].week], [5, 3])
  })

  test("a download is not added twice once the list has caught up", async () => {
    replies.POST = { body: { counted: true } }
    const { countDownload, listCommunity } = await fresh()
    await countDownload({ id: 1, downloads: 4, week: 2 })
    replies.GET = { body: { presets: [{ id: 1, votes: 0, rating: null, downloads: 5, week: 3 }], more: false } }
    const { presets } = await listCommunity({ ...POPULAR, sort: "week" })
    assert.deepEqual([presets[0].downloads, presets[0].week], [5, 3])
  })

  test("a download the server already had changes nothing", async () => {
    replies.POST = { body: { counted: false } }
    const { countDownload } = await fresh()
    assert.equal(await countDownload({ id: 1, downloads: 4 }), null)
  })

  test("a vote and a download on one preset both stay", async () => {
    replies.POST = VOTED
    const { countDownload, listCommunity, voteOn } = await fresh()
    await voteOn(1, 1)
    replies.POST = { body: { counted: true } }
    await countDownload({ id: 1, downloads: 0 })
    replies.GET = page([1])
    const { presets } = await listCommunity(POPULAR)
    assert.deepEqual([presets[0].votes, presets[0].downloads], [5, 1])
  })
})

describe("daily usage", () => {
  test("is only fetched once a day", async () => {
    replies.GET = { body: { used: 2, limit: 5, resetsAt: 0 } }
    const first = await fresh()
    await first.refreshUsage()
    await first.refreshUsage()
    const second = await fresh()
    await second.refreshUsage()
    assert.equal(requests.length, 1)
    assert.equal(second.usage.value.used, 2)
    mock.timers.setTime(Date.parse("2026-11-06T00:30:00Z"))
    await second.refreshUsage()
    assert.equal(requests.length, 2)
  })

  test("goes up when you share, without a fetch", async () => {
    replies.GET = { body: { used: 1, limit: 5, resetsAt: 0 } }
    replies.POST = { body: { preset: { id: 1 } } }
    const { refreshUsage, sharePublicly, usage } = await fresh()
    await refreshUsage()
    await sharePublicly("code", "name")
    assert.equal(usage.value.used, 2)
    assert.equal(requests.filter(item => item.startsWith("GET")).length, 1)
  })

  test("sharing on a new day starts the count again", async () => {
    replies.GET = { body: { used: 4, limit: 5, resetsAt: 0 } }
    replies.POST = { body: { preset: { id: 1 } } }
    const { refreshUsage, sharePublicly, usage } = await fresh()
    await refreshUsage()
    mock.timers.setTime(Date.parse("2026-11-06T09:00:00Z"))
    await sharePublicly("code", "name")
    assert.equal(usage.value.used, 1)
  })

  test("can be forced to check, for when the server says the limit is reached", async () => {
    replies.GET = { body: { used: 1, limit: 5, resetsAt: 0 } }
    const { refreshUsage, usage } = await fresh()
    await refreshUsage()
    replies.GET = { body: { used: 5, limit: 5, resetsAt: 0 } }
    await refreshUsage(true)
    assert.equal(usage.value.used, 5)
  })

  test("resets at midnight UTC", async () => {
    replies.GET = { body: { used: 0, limit: 5, resetsAt: 0 } }
    const { refreshUsage, usage } = await fresh()
    await refreshUsage()
    assert.equal(usage.value.resetsAt, Date.parse("2026-11-06T00:00:00Z"))
  })
})

describe("sharing", () => {
  test("clears the cached pages so your title shows up in every sort", async () => {
    replies.GET = page([1])
    replies.POST = { body: { preset: { id: 2 } } }
    const { listCommunity, sharePublicly } = await fresh()
    await listCommunity({ ...POPULAR, sort: "new" })
    await listCommunity({ ...POPULAR, sort: "needs" })
    await listCommunity(POPULAR)
    await sharePublicly("code", "name")
    await listCommunity({ ...POPULAR, sort: "new" })
    await listCommunity({ ...POPULAR, sort: "needs" })
    await listCommunity(POPULAR)
    assert.equal(requests.filter(item => item.startsWith("GET")).length, 6)
  })
})

describe("needs votes", () => {
  test("leaves out presets you shared", async () => {
    replies.GET = page([1, 2])
    replies.POST = { body: { preset: { id: 2 } } }
    const { listCommunity, sharePublicly } = await fresh()
    await sharePublicly("code", "name")
    const { presets, next } = await listCommunity({ sort: "needs", search: "", offset: 0 })
    assert.deepEqual(presets.map(preset => preset.id), [1])
    assert.equal(next, 2)
  })
})

describe("random", () => {
  test("sharing gets a new batch so your title can come up", async () => {
    replies.GET = page([1])
    replies.POST = { body: { preset: { id: 2 } } }
    const { listCommunity, sharePublicly } = await fresh()
    await listCommunity({ ...POPULAR, sort: "random" })
    await sharePublicly("code", "name")
    await listCommunity({ ...POPULAR, sort: "random" })
    assert.equal(requests.filter(item => item.startsWith("GET")).length, 2)
  })

  test("reuses one batch across tab views and random picks", async () => {
    replies.GET = page([1, 2, 3])
    const { listCommunity, randomCommunityPreset } = await fresh()
    await listCommunity({ ...POPULAR, sort: "random" })
    await listCommunity({ ...POPULAR, sort: "random" })
    assert.ok([1, 2, 3].includes((await randomCommunityPreset()).id))
    assert.equal(requests.length, 1)
  })

  test("shuffling soon after only mixes up what it already has", async () => {
    replies.GET = page([1, 2, 3, 4, 5, 6, 7, 8])
    const { listCommunity, shuffleCommunity } = await fresh()
    await listCommunity({ ...POPULAR, sort: "random" })
    mock.timers.setTime(Date.now() + 30000)
    const { presets } = await shuffleCommunity()
    assert.equal(requests.length, 1)
    assert.deepEqual(presets.map(preset => preset.id).sort(), [1, 2, 3, 4, 5, 6, 7, 8])
  })

  test("shuffling after a minute gets a new batch", async () => {
    replies.GET = page([1])
    const { listCommunity, shuffleCommunity } = await fresh()
    await listCommunity({ ...POPULAR, sort: "random" })
    mock.timers.setTime(Date.now() + 61000)
    await shuffleCommunity()
    assert.equal(requests.length, 2)
  })

  test("a random pick with nothing shared is nothing", async () => {
    replies.GET = page([])
    const { randomCommunityPreset } = await fresh()
    assert.equal(await randomCommunityPreset(), null)
  })

  test("random search is not cached, but random lists are", async () => {
    replies.GET = page([1])
    const { listCommunity } = await fresh()
    await listCommunity({ sort: "random", search: "stone", offset: 0 })
    await listCommunity({ sort: "random", search: "stone", offset: 0 })
    assert.equal(requests.length, 2)
  })

  test("gets a new batch once the old one is 30 minutes old", async () => {
    replies.GET = page([1])
    const { listCommunity } = await fresh()
    await listCommunity({ ...POPULAR, sort: "random" })
    mock.timers.setTime(Date.now() + 31 * 60000)
    await listCommunity({ ...POPULAR, sort: "random" })
    assert.equal(requests.length, 2)
  })
})
