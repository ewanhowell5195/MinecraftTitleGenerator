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

  test("a vote shows on a random pick", async () => {
    replies.GET = page([1])
    replies.POST = VOTED
    const { randomCommunityPreset, voteOn } = await fresh()
    await randomCommunityPreset()
    await voteOn(1, 1)
    assert.equal((await randomCommunityPreset()).votes, 5)
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

describe("presets you shared", () => {
  test("come from the server too, so other browsers know", async () => {
    replies.GET = { body: { used: 1, limit: 5, resetsAt: 0, shared: [4, 9] } }
    const { ownPresets, refreshUsage } = await fresh()
    await refreshUsage()
    assert.deepEqual(ownPresets.value, [4, 9])
  })

  test("are kept with the ones this browser already knew, without repeats", async () => {
    replies.POST = { body: { preset: { id: 4 } } }
    const { ownPresets, refreshUsage, sharePublicly } = await fresh()
    await sharePublicly("code", "name")
    replies.GET = { body: { used: 1, limit: 5, resetsAt: 0, shared: [4, 9] } }
    await refreshUsage(true)
    assert.deepEqual(ownPresets.value, [4, 9])
  })

  test("are asked for once by a browser that only knew its share count", async () => {
    stored.set("minecraft-title-community", JSON.stringify({ usage: { day: "2026-11-05", used: 2 } }))
    replies.GET = { body: { used: 2, limit: 5, resetsAt: 0, shared: [1] } }
    const { ownPresets, refreshUsage } = await fresh()
    await refreshUsage()
    await refreshUsage()
    assert.deepEqual(ownPresets.value, [1])
    assert.equal(requests.length, 1)
  })

  test("only asks once when two things want it at the same time", async () => {
    replies.GET = { body: { used: 1, limit: 5, resetsAt: 0, shared: [] } }
    const { refreshUsage } = await fresh()
    await Promise.all([refreshUsage(), refreshUsage()])
    assert.equal(requests.length, 1)
  })

  test("sharing doesn't make a browser skip asking", async () => {
    replies.POST = { body: { preset: { id: 4 } } }
    const { refreshUsage, sharePublicly } = await fresh()
    await sharePublicly("code", "name")
    replies.GET = { body: { used: 1, limit: 5, resetsAt: 0, shared: [4, 1] } }
    await refreshUsage()
    assert.equal(requests.filter(item => item.startsWith("GET")).length, 1)
  })
})

describe("daily usage", () => {
  test("is only fetched once a day", async () => {
    replies.GET = { body: { used: 2, limit: 5, resetsAt: 0, shared: [] } }
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
    replies.GET = { body: { used: 1, limit: 5, resetsAt: 0, shared: [] } }
    replies.POST = { body: { preset: { id: 1 } } }
    const { refreshUsage, sharePublicly, usage } = await fresh()
    await refreshUsage()
    await sharePublicly("code", "name")
    assert.equal(usage.value.used, 2)
    assert.equal(requests.filter(item => item.startsWith("GET")).length, 1)
  })

  test("sharing on a new day starts the count again", async () => {
    replies.GET = { body: { used: 4, limit: 5, resetsAt: 0, shared: [] } }
    replies.POST = { body: { preset: { id: 1 } } }
    const { refreshUsage, sharePublicly, usage } = await fresh()
    await refreshUsage()
    mock.timers.setTime(Date.parse("2026-11-06T09:00:00Z"))
    await sharePublicly("code", "name")
    assert.equal(usage.value.used, 1)
  })

  test("can be forced to check, for when the server says the limit is reached", async () => {
    replies.GET = { body: { used: 1, limit: 5, resetsAt: 0, shared: [] } }
    const { refreshUsage, usage } = await fresh()
    await refreshUsage()
    replies.GET = { body: { used: 5, limit: 5, resetsAt: 0, shared: [] } }
    await refreshUsage(true)
    assert.equal(usage.value.used, 5)
  })

  test("resets at midnight UTC", async () => {
    replies.GET = { body: { used: 0, limit: 5, resetsAt: 0, shared: [] } }
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
    const { randomCommunityPreset, sharePublicly } = await fresh()
    await randomCommunityPreset()
    await sharePublicly("code", "name")
    await randomCommunityPreset()
    assert.equal(requests.filter(item => item.startsWith("GET")).length, 2)
  })

  test("reuses one batch for random picks", async () => {
    replies.GET = page([1, 2, 3])
    const { randomCommunityPreset } = await fresh()
    assert.ok([1, 2, 3].includes((await randomCommunityPreset()).id))
    assert.ok([1, 2, 3].includes((await randomCommunityPreset()).id))
    assert.equal(requests.length, 1)
  })

  test("never lands on the preset you are looking at", async () => {
    replies.GET = page([1, 2])
    const { randomCommunityPreset } = await fresh()
    for (let index = 0; index < 50; index++) assert.equal((await randomCommunityPreset(1)).id, 2)
    assert.equal(requests.length, 1)
  })

  test("gets a new batch when the old one only has the preset you are looking at", async () => {
    replies.GET = page([1])
    const { randomCommunityPreset } = await fresh()
    await randomCommunityPreset()
    mock.timers.setTime(Date.now() + 61000)
    replies.GET = page([1, 2])
    assert.equal((await randomCommunityPreset(1)).id, 2)
    assert.equal(requests.length, 2)
  })

  test("has nothing to show when yours is the only preset, without asking again straight away", async () => {
    replies.GET = page([1])
    const { randomCommunityPreset } = await fresh()
    assert.equal(await randomCommunityPreset(1), null)
    assert.equal(await randomCommunityPreset(1), null)
    assert.equal(requests.length, 1)
  })

  test("a random pick with nothing shared is nothing", async () => {
    replies.GET = page([])
    const { randomCommunityPreset } = await fresh()
    assert.equal(await randomCommunityPreset(), null)
  })

  test("gets a new batch once the old one is 30 minutes old", async () => {
    replies.GET = page([1])
    const { randomCommunityPreset } = await fresh()
    await randomCommunityPreset()
    mock.timers.setTime(Date.now() + 31 * 60000)
    await randomCommunityPreset()
    assert.equal(requests.length, 2)
  })
})

describe("a single preset", () => {
  test("comes from a saved list when it can, with no request", async () => {
    replies.GET = page([1, 2])
    const { communityPreset, listCommunity } = await fresh()
    await listCommunity(POPULAR)
    assert.equal((await communityPreset(2)).id, 2)
    assert.equal(requests.length, 1)
  })

  test("is fetched when no saved list has it", async () => {
    replies.GET = { body: { preset: { id: 9, votes: 1, rating: null, downloads: 0 } } }
    const { communityPreset } = await fresh()
    assert.equal((await communityPreset(9)).id, 9)
    assert.deepEqual(requests, ["GET /api/presets/9"])
  })

  test("ignores a saved list that has expired", async () => {
    replies.GET = page([9])
    const { communityPreset, listCommunity } = await fresh()
    await listCommunity(POPULAR)
    mock.timers.setTime(Date.now() + 31 * 60000)
    replies.GET = { body: { preset: { id: 9, votes: 1, rating: null, downloads: 0 } } }
    assert.equal((await communityPreset(9)).votes, 1)
    assert.equal(requests.length, 2)
  })

  test("shows your own changes", async () => {
    replies.POST = { body: { votes: 5, rating: 4, vote: 1 } }
    const { communityPreset, voteOn } = await fresh()
    await voteOn(9, 1)
    replies.GET = { body: { preset: { id: 9, votes: 0, rating: null, downloads: 0 } } }
    const preset = await communityPreset(9)
    assert.deepEqual([preset.votes, preset.vote], [5, 1])
  })

  test("reports a preset that doesn't exist", async () => {
    replies.GET = { status: 404, body: { error: "This preset doesn't exist." } }
    const { communityPreset } = await fresh()
    await assert.rejects(communityPreset(9), /doesn't exist/)
  })
})

describe("accounts", () => {
  const SOMEONE = { id: 1, name: "Someone", provider: "discord" }
  const channels = []

  globalThis.BroadcastChannel = class {
    constructor() {
      this.sent = []
      channels.push(this)
    }
    postMessage(message) {
      this.sent.push(message)
    }
  }

  function signedIn(owned = [7]) {
    replies["GET /api/account"] = { body: { user: SOMEONE } }
    replies["GET /api/presets/usage"] = { body: { used: 2, shared: owned, owned } }
  }

  function signedOut() {
    replies["GET /api/account"] = { body: { user: null } }
    replies["GET /api/presets/usage"] = { body: { used: 0, shared: [] } }
  }

  beforeEach(() => {
    channels.length = 0
  })

  test("signed out asks for nothing else", async () => {
    signedOut()
    const { account, refreshAccount } = await fresh()
    await refreshAccount()
    assert.equal(account.value, null)
    assert.deepEqual(requests, ["GET /api/account"])
  })

  test("signed in loads the usage and what the account owns", async () => {
    signedIn()
    const { account, accountPresets, ownPresets, refreshAccount, usage } = await fresh()
    await refreshAccount()
    assert.equal(account.value.name, "Someone")
    assert.deepEqual(accountPresets.value, [7])
    assert.deepEqual(ownPresets.value, [7])
    assert.equal(usage.value.used, 2)
  })

  test("only checks once per page unless forced", async () => {
    signedIn()
    const { refreshAccount } = await fresh()
    await refreshAccount()
    requests.length = 0
    await refreshAccount()
    assert.deepEqual(requests, [])
    await refreshAccount(true)
    assert.ok(requests.includes("GET /api/account"))
  })

  test("a failed check keeps the remembered account", async () => {
    signedIn()
    await (await fresh()).refreshAccount()
    replies["GET /api/account"] = { status: 500, body: null }
    const { account, refreshAccount } = await fresh()
    const logged = mock.method(console, "error", () => {})
    await refreshAccount()
    logged.mock.restore()
    assert.equal(account.value.name, "Someone")
  })

  test("a preset shared while signed in can be managed straight away", async () => {
    signedIn([])
    const { accountPresets, refreshAccount, sharePublicly } = await fresh()
    await refreshAccount()
    replies.POST = { status: 201, body: { preset: { id: 9 }, onAccount: true } }
    await sharePublicly("code", "name")
    assert.deepEqual(accountPresets.value, [9])
  })

  test("sharing says whether it expects an account", async () => {
    const bodies = []
    const realFetch = globalThis.fetch
    globalThis.fetch = async (url, options) => {
      if (options?.method === "POST") bodies.push(JSON.parse(options.body).account)
      return realFetch(url, options)
    }
    try {
      replies.POST = { status: 201, body: { preset: { id: 9 } } }
      await (await fresh()).sharePublicly("code", "name")
      signedIn([])
      const named = await fresh()
      await named.refreshAccount()
      await named.sharePublicly("code", "name")
      assert.deepEqual(bodies, [false, true])
    } finally {
      globalThis.fetch = realFetch
    }
  })

  test("a 401 rechecks the account", async () => {
    signedIn([])
    const { account, refreshAccount, sharePublicly } = await fresh()
    await refreshAccount()
    signedOut()
    replies.POST = { status: 401, body: { error: "You've been signed out." } }
    await assert.rejects(sharePublicly("code", "name"), /signed out/)
    await refreshAccount(true)
    assert.equal(account.value, null)
  })

  test("signing in replaces what's yours and your votes with the account's", async () => {
    replies["GET /api/account"] = { body: { user: null } }
    replies["GET /api/presets/usage"] = { body: { used: 0, shared: [4], votes: { 3: 1 } } }
    const { accountChanges, ownPresets, refreshAccount, refreshUsage, listCommunity } = await fresh()
    await refreshUsage(true)
    await refreshAccount()
    assert.deepEqual(ownPresets.value, [4])
    signedIn([7])
    replies["GET /api/presets/usage"] = { body: { used: 2, shared: [7], owned: [7], votes: { 5: -1 } } }
    await refreshAccount(true)
    assert.deepEqual(ownPresets.value, [7])
    assert.equal(accountChanges.value, 1)
    replies.GET = page([3, 5])
    const { presets } = await listCommunity(POPULAR)
    assert.deepEqual(presets.map(preset => preset.vote), [0, -1])
  })

  test("unlimited shares never reach the limit, even after sharing", async () => {
    signedIn([])
    replies["GET /api/presets/usage"] = { body: { used: 40, shared: [], owned: [], unlimited: true } }
    const { refreshAccount, sharePublicly, usage } = await fresh()
    await refreshAccount()
    assert.equal(usage.value.unlimited, true)
    assert.equal(usage.value.used >= usage.value.limit, false)
    replies.POST = { status: 201, body: { preset: { id: 9 }, onAccount: true } }
    await sharePublicly("code", "name")
    assert.equal(usage.value.unlimited, true)
    assert.equal(usage.value.used, 41)
  })

  test("checking the same account again doesn't count as a change", async () => {
    signedIn()
    const { accountChanges, refreshAccount } = await fresh()
    await refreshAccount()
    assert.equal(accountChanges.value, 1)
    await refreshAccount(true)
    assert.equal(accountChanges.value, 1)
  })

  test("signing out forgets the account's presets and tells other tabs", async () => {
    signedIn()
    const { accountPresets, ownPresets, refreshAccount, signOut } = await fresh()
    await refreshAccount()
    signedOut()
    replies["POST /api/account/logout"] = { body: { user: null } }
    await signOut()
    assert.deepEqual(accountPresets.value, [])
    assert.deepEqual(ownPresets.value, [])
    assert.deepEqual(channels[0].sent, ["changed"])
  })

  test("a message from the sign-in window rechecks the account", async () => {
    signedOut()
    const { account, refreshAccount } = await fresh()
    await refreshAccount()
    signedIn()
    channels[0].onmessage({ data: "changed" })
    await refreshAccount(true)
    assert.equal(account.value.name, "Someone")
  })

  test("a rename shows at once even while old pages are cached at the edge", async () => {
    replies.PATCH = { body: { preset: { id: 1, name: "New" } } }
    replies.GET = page([1, 2])
    const { listCommunity, renameShared } = await fresh()
    await listCommunity(POPULAR)
    assert.equal(await renameShared(1, "New"), "New")
    const { presets } = await listCommunity(POPULAR)
    assert.equal(presets[0].name, "New")
    assert.equal(requests.filter(request => request.startsWith("GET")).length, 2)
  })

  test("a deleted preset stays hidden while old pages are cached at the edge", async () => {
    signedIn([1])
    replies.GET = page([1, 2])
    replies.DELETE = { body: { deleted: true } }
    const { accountPresets, communityPreset, deleteShared, listCommunity, refreshAccount } = await fresh()
    await refreshAccount()
    await listCommunity(POPULAR)
    await deleteShared(1)
    const { presets, next } = await listCommunity(POPULAR)
    assert.deepEqual(presets.map(preset => preset.id), [2])
    assert.equal(next, 2)
    assert.deepEqual(accountPresets.value, [])
    await assert.rejects(communityPreset(1), error => error.status === 404)
  })
})
