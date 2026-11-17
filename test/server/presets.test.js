import { afterEach, beforeEach, describe, mock, test } from "node:test"
import assert from "node:assert/strict"
import { batchesTogether, code, context, db, download, env, freshServer, list, post, share, usageOf, vote, voteAll } from "../helpers/presets.js"
import { holdQuery } from "../helpers/server.js"

const { LIMITS } = await import("../../src/lib/core/limits.js")
const { checkTitle, getPreset, listPresets, submitPreset } = await import("../../src/server/presets.js")
const { countDownload, presetStats, votePreset } = await import("../../src/server/presetScores.js")
const { presetDetails, presetPageDetails } = await import("../../src/server/presetPages.js")
const { titleFacts } = await import("../../src/lib/link/titleFacts.js")
const { encodeTitle } = await import("../../src/lib/link/linkformat.js")
const { FILE_VERSION } = await import("../../src/lib/settings/upgrades.js")

beforeEach(freshServer)

describe("titleFacts", () => {
  test("joins lines, and words by their spaces", () => {
    const facts = titleFacts([{ text: "top" }, { words: [{ text: "one" }, { text: "two", spaceBefore: true }, { text: "three" }] }])
    assert.equal(facts.text, "top one twothree")
    assert.equal(facts.words, 4)
  })

  test("a line with no text uses the default text", () => {
    assert.equal(titleFacts([{ texture: "cracked" }]).text, "Minecraft")
  })

  test("a hidden line stays out of the search text but is still checked", () => {
    const facts = titleFacts([{ text: "shown" }, { text: "hidden", hidden: true }])
    assert.equal(facts.text, "shown")
    assert.equal(facts.all, "shown hidden")
  })

  test("counts characters, not bytes", () => {
    assert.equal(titleFacts([{ text: "é😀" }]).characters, 2)
  })

  test("counts shapes apart from the text", () => {
    const facts = titleFacts([{ text: "a" }, { shape: "heart" }, { shape: "cube", hidden: true }])
    assert.equal(facts.text, "a")
    assert.equal(facts.words, 1)
    assert.equal(facts.shapes, 1)
  })
})

describe("checkTitle", () => {
  function refusal(value) {
    try {
      checkTitle(value)
    } catch (err) {
      return err.message
    }
    return null
  }

  test("accepts a normal title", () => {
    assert.equal(checkTitle(code([{ text: "minecraft", texture: "cracked" }, { type: "bottom", text: "title generator", hue: 20 }])).text, "minecraft title generator")
  })

  test("refuses too many lines", () => {
    assert.match(refusal(code(Array.from({ length: 7 }, () => ({ text: "a" })))), /up to 6 lines/)
  })

  test("refuses too many words", () => {
    assert.match(refusal(code([{ words: Array.from({ length: 13 }, () => ({ text: "a" })) }])), /up to 12 words/)
  })

  test("refuses too much text", () => {
    assert.match(refusal(code([{ text: "a".repeat(61) }])), /up to 60 characters/)
  })

  test("refuses a long code", () => {
    assert.match(refusal("2" + "a".repeat(LIMITS.code)), /too many settings/)
  })

  test("refuses a damaged code", () => {
    assert.match(refusal("2!!!!"), /damaged/)
  })

  test("refuses a newer version", () => {
    assert.match(refusal(code([{ text: "a" }], FILE_VERSION + 1)), /newer version/)
  })

  test("refuses a title with no text", () => {
    assert.match(refusal(code([{ text: "   " }])), /no text/)
  })

  test("accepts a title made only of shapes", () => {
    assert.equal(refusal(code([{ shape: "heart" }])), null)
  })

  test("refuses a shape inside a line of words", () => {
    assert.match(refusal(code([{ words: [{ text: "a" }, { shape: "heart" }] }])), /can't be shared: a shape is used as a word in a line/)
  })

  test("refuses titles the editor could not open", () => {
    assert.match(refusal(code([{ text: "a" }, { words: [] }])), /can't be shared: a line has no words in it/)
    assert.match(refusal(code([{ text: "a", matchWidth: 7 }])), /can't be shared: a line matches the width of line 7, which doesn't exist/)
    assert.match(refusal(code([{ text: "a", matchWidth: 0 }])), /can't be shared: line 0 matches its own width/)
    assert.match(refusal(code([{ text: "a" }, { words: [{ text: "b", matchWidth: 0 }] }])), /can't be shared: a word sets matchWidth/)
  })

  test("refuses settings the app does not know, even inside words and layers", () => {
    assert.match(refusal(code([{ text: "a", secret: "hello" }])), /can't be shared: secret/)
    assert.match(refusal(code([{ words: [{ text: "a", secret: "hello" }] }])), /can't be shared: secret/)
    assert.match(refusal(code([{ text: "a", overlays: [{ overlay: "dust", secret: "hello" }] }])), /can't be shared: secret/)
  })

  test("refuses a known setting of the wrong type", () => {
    assert.match(refusal(code([{ text: "a", hue: "red" }])), /can't be shared: hue/)
  })

  test("the link format has already removed uploaded overlays", () => {
    const { code: stripped, skipped } = encodeTitle({ version: FILE_VERSION, lines: [{ text: "a", overlays: [{ source: "file", file: "data:image/png;base64,AAAA" }] }] })
    assert.equal(skipped, 1)
    assert.equal(checkTitle(stripped).text, "a")
  })
})

describe("submitting", () => {
  test("only takes fonts, textures, tileables and overlays the site has published", async () => {
    const published = [{ text: "a", font: "minecraft-ten", texture: "cracked" }, { type: "bottom", text: "b", textureSource: "tileable", tileableSource: "premade", tileable: "checkerboard" }]
    assert.equal((await post({ code: code(published) })).status, 201)
    for (const [lines, wanted] of [
      [[{ text: "c", font: "preview-only" }], /no font called preview-only/],
      [[{ text: "d", texture: "preview-only" }], /no minecraft-ten texture called preview-only/],
      [[{ text: "e", textureSource: "tileable", tileableSource: "premade", tileable: "preview-only" }], /no tileable called preview-only/],
      [[{ text: "f", overlayMode: "custom", overlays: [{ overlay: "preview-only" }] }], /no minecraft-ten overlay called preview-only/],
      [[{ text: "g", separateTexture: true, layerSettings: [{ texture: "preview-only" }] }], /no minecraft-ten texture called preview-only/]
    ]) {
      const refused = await post({ code: code(lines) })
      assert.equal(refused.status, 400)
      assert.match(refused.error, wanted)
    }
  })

  test("stores the preset with the text worked out on the server", async () => {
    const { status, preset } = await post({ code: code([{ text: "stone" }]), name: "My name", credit: "Ewan", text: "ignored" })
    assert.equal(status, 201)
    assert.equal(preset.name, "My name")
    assert.equal(preset.text, "stone")
    assert.equal("credit" in preset, false)
    assert.equal(preset.downloads, 0)
    assert.ok(preset.createdAt > 0)
  })

  test("the name defaults to the text", async () => {
    assert.equal((await post({ code: code([{ text: "STONE wall" }]) })).preset.name, "Stone Wall")
    assert.equal((await post({ code: code([{ text: "dirt" }]), name: "   " })).preset.name, "Dirt")
  })

  test("the same title shared twice at once is refused once, and the refusal says which preset", async () => {
    batchesTogether()
    const sent = await Promise.all([post({ code: code([{ text: "stone" }]) }), post({ code: code([{ text: "stone" }]), name: "other" }, "2.2.2.2")])
    assert.deepEqual(sent.map(item => item.status).sort(), [201, 409])
    const made = sent.find(item => item.status === 201)
    assert.equal(sent.find(item => item.status === 409).id, made.preset.id)
    assert.equal((await usageOf("2.2.2.2")).used + (await usageOf()).used, 1)
  })

  test("refuses a duplicate and says which preset it is", async () => {
    const first = await post({ code: code([{ text: "stone" }]) })
    const second = await post({ code: code([{ text: "stone" }]), name: "other" }, "2.2.2.2")
    assert.equal(second.status, 409)
    assert.equal(second.id, first.preset.id)
  })

  for (const [label, body] of [["title", { lines: [{ text: "fuck" }] }], ["hidden line", { lines: [{ text: "fine" }, { text: "fuck", hidden: true }] }], ["name", { lines: [{ text: "fine" }], name: "shit" }], ["swapped letters", { lines: [{ text: "sh1t" }] }]]) {
    test(`filters rude words in the ${label}`, async () => {
      const { status, error } = await post({ code: code(body.lines), name: body.name })
      assert.equal(status, 400)
      assert.match(error, /isn't allowed/)
      assert.equal((await list()).presets.length, 0)
    })
  }

  for (const text of ["minecraft", "assassin", "classic", "bass", "cracked", "grass", "scunthorpe", "skyblock", "the nether", "hello world", "title generator", "bedrock edition", "shitake", "pass", "button"]) {
    test(`does not filter ${text}`, async () => {
      assert.equal((await post({ code: code([{ text }]) })).status, 201)
    })
  }

  test("refuses a name shorter than 3 characters", async () => {
    const { status, error } = await post({ code: code([{ text: "stone" }]), name: "H " })
    assert.equal(status, 400)
    assert.match(error, /at least 3 characters/)
    assert.equal((await post({ code: code([{ text: "stone" }]), name: "Hey" })).status, 201)
  })

  test("a title too short to name itself needs a name", async () => {
    assert.match((await post({ code: code([{ text: "H" }]) })).error, /at least 3 characters/)
  })

  test("refuses a long name", async () => {
    assert.match((await post({ code: code([{ text: "a" }]), name: "x".repeat(61) })).error, /name can be up to 60/)
  })

  test("refuses a field of the wrong type", async () => {
    assert.equal((await post({ code: code([{ text: "a" }]), name: { a: 1 } })).status, 400)
  })

  test("refuses a request that isn't JSON or is too big", async () => {
    const bad = await submitPreset({ request: new Request("https://example.test/", { method: "POST", headers: { "CF-Connecting-IP": "1" }, body: "nope" }), env, params: {} })
    assert.equal(bad.status, 400)
    const huge = await post({ code: "x".repeat(LIMITS.body + 1) })
    assert.equal(huge.status, 413)
  })

  test("refuses a request that says it is too big without reading it", async () => {
    let read = false
    const source = {
      pull(controller) {
        read = true
        controller.close()
      }
    }
    const body = new ReadableStream(source, { highWaterMark: 0 })
    const request = new Request("https://example.test/api/presets", { method: "POST", headers: { "CF-Connecting-IP": "1", "Content-Length": String(LIMITS.body + 1) }, body, duplex: "half" })
    assert.equal((await submitPreset({ request, env, params: {} })).status, 413)
    assert.equal(read, false)
  })

  test("stops reading a body once it is over the limit", async () => {
    let sent = 0
    const source = {
      pull(controller) {
        sent++
        controller.enqueue(new Uint8Array(LIMITS.body))
      }
    }
    const body = new ReadableStream(source, { highWaterMark: 0 })
    const request = new Request("https://example.test/api/presets", { method: "POST", headers: { "CF-Connecting-IP": "1" }, body, duplex: "half" })
    assert.equal((await submitPreset({ request, env, params: {} })).status, 413)
    assert.equal(sent, 2)
  })

  test("allows 5 a day per IP", async () => {
    for (let index = 0; index < 5; index++) assert.equal((await post({ code: code([{ text: `day${index}` }]) }, "9.9.9.9")).status, 201)
    const refused = await post({ code: code([{ text: "day5" }]) }, "9.9.9.9")
    assert.equal(refused.status, 429)
    assert.match(refused.error, /up to 5 titles a day/)
    assert.equal((await post({ code: code([{ text: "day5" }]) }, "8.8.8.8")).status, 201)
  })

  test("shares sent at once can't go past the daily limit", async () => {
    const sent = await Promise.all(Array.from({ length: 8 }, (_, index) => post({ code: code([{ text: `race ${index}` }]) }, "5.5.5.5")))
    assert.deepEqual(sent.map(item => item.status).sort(), [201, 201, 201, 201, 201, 429, 429, 429])
    assert.equal((await usageOf("5.5.5.5")).used, 5)
  })

  test("a share that fails gives its place in the daily limit back", async () => {
    const batch = env.DB.batch
    env.DB.batch = async () => {
      throw new Error("the database is away")
    }
    await assert.rejects(post({ code: code([{ text: "lost" }]) }, "5.5.5.5"), /the database is away/)
    env.DB.batch = batch
    assert.equal((await usageOf("5.5.5.5")).used, 0)
    assert.equal((await post({ code: code([{ text: "lost" }]) }, "5.5.5.5")).status, 201)
  })

  test("refused titles do not use up the daily limit", async () => {
    for (let index = 0; index < 6; index++) await post({ code: code([{ text: "fuck" }]) }, "7.7.7.7")
    assert.equal((await post({ code: code([{ text: "fine" }]) }, "7.7.7.7")).status, 201)
  })

  test("the limit starts again the next day", async () => {
    mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-11-05T23:00:00Z") })
    try {
      for (let index = 0; index < 5; index++) await post({ code: code([{ text: `next${index}` }]) }, "6.6.6.6")
      assert.equal((await post({ code: code([{ text: "next5" }]) }, "6.6.6.6")).status, 429)
      mock.timers.setTime(Date.parse("2026-11-06T01:00:00Z"))
      assert.equal((await post({ code: code([{ text: "next5" }]) }, "6.6.6.6")).status, 201)
    } finally {
      mock.timers.reset()
    }
  })

  test("forgets signed out daily counts after their day", async () => {
    await post({ code: code([{ text: "old" }]) }, "7.7.7.7")
    db.prepare("UPDATE preset_submissions SET day = '2000-01-01'").run()
    await post({ code: code([{ text: "new" }]) }, "8.8.8.8")
    assert.deepEqual(db.prepare("SELECT day FROM preset_submissions").all().map(row => row.day), [new Date().toISOString().slice(0, 10)])
  })

  test("never stores an IP address, only its hash", async () => {
    await post({ code: code([{ text: "abc" }]) }, "123.45.67.89")
    const [row] = db.prepare("SELECT ip_hash FROM preset_submissions").all()
    assert.equal(row.ip_hash.length, 64)
    assert.equal(row.ip_hash.includes("123.45"), false)
  })

  test("a missing salt fails loudly rather than storing unsalted hashes", async () => {
    env.IP_SALT = ""
    await assert.rejects(post({ code: code([{ text: "abc" }]) }), /IP_SALT is not set/)
  })
})

describe("listing", () => {
  test("sorts by downloads, rating or date", async () => {
    const first = await share("first")
    const second = await share("second")
    const third = await share("third")
    await download(second.id, "a")
    await download(second.id, "b")
    await download(third.id, "a")
    await voteAll(first.id, [1, 1, 1, 1, 1])
    await voteAll(second.id, [-1, -1, -1, -1, -1])
    db.prepare("UPDATE presets SET created_at = ? WHERE id = ?").run(1000, first.id)
    db.prepare("UPDATE presets SET created_at = ? WHERE id = ?").run(3000, second.id)
    db.prepare("UPDATE presets SET created_at = ? WHERE id = ?").run(2000, third.id)
    const names = async sort => (await list(`?sort=${sort}`)).presets.map(preset => preset.text)
    assert.deepEqual(await names("popular"), ["second", "third", "first"])
    assert.deepEqual(await names("top"), ["first", "second", "third"])
    assert.deepEqual(await names("new"), ["second", "third", "first"])
  })

  test("refuses an unknown sort rather than building it into the query", async () => {
    assert.equal((await list("?sort=id;DROP TABLE presets")).status, 400)
    assert.equal((await list()).status, 200)
  })

  test("pages through the results", async () => {
    for (let index = 0; index < LIMITS.page + 2; index++) await share(`title ${index}`)
    const first = await list("?sort=new")
    assert.equal(first.presets.length, LIMITS.page)
    assert.equal(first.more, true)
    const second = await list(`?sort=new&offset=${LIMITS.page}`)
    assert.equal(second.presets.length, 2)
    assert.equal(second.more, false)
    assert.equal(new Set(first.presets.concat(second.presets).map(preset => preset.id)).size, LIMITS.page + 2)
  })

  test("refuses a bad offset", async () => {
    assert.equal((await list("?offset=-1")).status, 400)
    assert.equal((await list("?offset=abc")).status, 400)
  })

  test("search finds the name or the text", async () => {
    await share("stone wall", { name: "Castle" })
    await share("dirt", { name: "Farm" })
    await share("oak", { name: "Forest" })
    const found = async term => (await list(`?q=${term}`)).presets.map(preset => preset.name).sort()
    assert.deepEqual(await found("castle"), ["Castle"])
    assert.deepEqual(await found("STONE"), ["Castle"])
    assert.deepEqual(await found("dirt"), ["Farm"])
    assert.deepEqual(await found("oa"), ["Forest"])
    assert.deepEqual(await found("nothing"), [])
  })

  test("treats search wildcards as plain characters", async () => {
    await share("100% real")
    await share("plain")
    assert.deepEqual((await list("?q=0%25")).presets.map(preset => preset.text), ["100% real"])
    assert.deepEqual((await list("?q=__")).presets, [])
  })

  test("cannot be used to inject SQL through search", async () => {
    await share("safe")
    assert.equal((await list(`?q=${encodeURIComponent("' OR 1=1; DROP TABLE presets; --")}`)).presets.length, 0)
    assert.equal((await list()).presets.length, 1)
  })

  test("doesn't change from one visitor to the next, so it can be shared", async () => {
    const preset = await share("voted")
    await vote(preset.id, 1, "a")
    assert.deepEqual((await list("", "a")).presets, (await list("", "b")).presets)
    assert.equal("vote" in (await list("", "a")).presets[0], false)
  })

  test("doesn't need a visitor's IP or salt", async () => {
    env.IP_SALT = ""
    assert.equal((await listPresets({ request: new Request("https://example.test/api/presets"), env, params: {} })).status, 200)
  })

  test("a single letter searches", async () => {
    await share("stone")
    await share("dirt")
    assert.deepEqual((await list("?q=s")).presets.map(preset => preset.text), ["stone"])
  })

  describe("edge cache", () => {
    let entries
    let reads

    beforeEach(() => {
      entries = new Map()
      reads = 0
      globalThis.caches = { default: { match: async request => entries.get(request.url)?.clone(), put: async (request, response) => { entries.set(request.url, response) }, delete: async () => {} } }
      const prepare = env.DB.prepare
      env.DB.prepare = sql => {
        if (sql.startsWith("SELECT id, code")) reads++
        return prepare(sql)
      }
    })

    afterEach(() => {
      delete globalThis.caches
    })

    test("a repeat request doesn't read the database", async () => {
      await share("cached")
      const first = await list("?sort=top")
      const second = await list("?sort=top")
      assert.deepEqual(first.presets, second.presets)
      assert.equal(reads, 1)
    })

    test("different requests are cached apart", async () => {
      await list("?sort=top")
      await list("?sort=new")
      await list("?sort=top&q=stone")
      assert.equal(reads, 3)
    })

    test("is shared between visitors", async () => {
      await list("?sort=top", "a")
      await list("?sort=top", "b")
      assert.equal(reads, 1)
    })

    test("responses say how long to keep them", async () => {
      await list("?sort=top")
      assert.equal(entries.values().next().value.headers.get("Cache-Control"), "public, max-age=1800")
    })

    test("refusals aren't cached", async () => {
      await list("?sort=nope")
      assert.equal(entries.size, 0)
    })

    test("random isn't cached", async () => {
      await share("a")
      await list("?sort=random")
      assert.equal(entries.size, 0)
    })

    test("waits for the save through waitUntil when it can", async () => {
      const waited = []
      const response = await listPresets({ ...context("/api/presets?sort=top"), waitUntil: promise => waited.push(promise) })
      assert.equal(response.status, 200)
      assert.equal(waited.length, 1)
    })
  })

  test("never returns IP hashes", async () => {
    const preset = await share("private")
    await vote(preset.id, 1, "a")
    await download(preset.id, "a")
    assert.equal(JSON.stringify(await list()).includes("ip_hash"), false)
  })
})

describe("voting and rating", () => {
  test("shows no rating until there are 5 votes", async () => {
    const { id } = await share("a")
    await voteAll(id, [1, 1, 1, 1])
    const before = (await list()).presets[0]
    assert.equal(before.rating, null)
    assert.equal(before.votes, 4)
    const { rating, votes } = await vote(id, -1, "fifth")
    assert.equal(votes, 5)
    assert.equal(rating, 4)
    assert.equal((await list()).presets[0].rating, 4)
  })

  test("the rating is the share of upvotes out of 5", async () => {
    const { id } = await share("a")
    await voteAll(id, [1, 1, 1, 1, 1, 1, -1, -1])
    assert.equal((await list()).presets[0].rating, 3.75)
  })

  test("all downvotes is a real rating of 0, not no rating", async () => {
    const { id } = await share("a")
    await voteAll(id, [-1, -1, -1, -1, -1])
    assert.equal((await list()).presets[0].rating, 0)
  })

  test("a new preset has no rating", async () => {
    const preset = await share("new")
    assert.equal(preset.rating, null)
    assert.equal(preset.votes, 0)
  })

  test("counts one vote per IP", async () => {
    const { id } = await share("a")
    await vote(id, 1, "same")
    const { votes } = await vote(id, 1, "same")
    assert.equal(votes, 1)
  })

  test("counts one vote for every IPv6 address in the same /64", async () => {
    const { id } = await share("a")
    await vote(id, 1, "2001:db8:1:2::1")
    assert.equal((await vote(id, 1, "2001:db8:1:2:ffff:ffff:ffff:ffff")).votes, 1)
    assert.equal((await vote(id, 1, "2001:0DB8:0001:0002:0:0:0:9")).votes, 1)
    assert.equal((await vote(id, 1, "2001:db8:1:3::1")).votes, 2)
    assert.equal((await vote(id, 1, "2001:db8:1::2:0:0:1")).votes, 3)
    assert.equal((await vote(id, 1, "2001:db8:1:0:9::")).votes, 3)
    assert.equal((await vote(id, 1, "::1")).votes, 4)
    assert.equal((await vote(id, 1, "::2")).votes, 4)
  })

  test("keeps IPv4 addresses apart", async () => {
    const { id } = await share("a")
    await vote(id, 1, "10.0.0.1")
    assert.equal((await vote(id, 1, "10.0.0.2")).votes, 2)
  })

  test("changing a vote replaces the old one", async () => {
    const { id } = await share("a")
    await voteAll(id, [1, 1, 1, 1])
    await vote(id, -1, "same")
    const { votes, rating, vote: mine } = await vote(id, 1, "same")
    assert.deepEqual({ votes, rating, mine }, { votes: 5, rating: 5, mine: 1 })
  })

  test("a vote can't be taken back", async () => {
    const { id } = await share("a")
    await vote(id, 1, "same")
    assert.equal((await vote(id, 0, "same")).status, 400)
    assert.equal(db.prepare("SELECT votes FROM presets WHERE id = ?").get(id).votes, 1)
    assert.equal(db.prepare("SELECT COUNT(*) AS rows FROM preset_votes").get().rows, 1)
  })

  test("lets everyone else vote on it", async () => {
    const { id } = await share("mine", {}, "me")
    assert.equal((await vote(id, 1, "someone")).votes, 1)
  })

  test("a falsely high rating drops as more people vote", async () => {
    const { id } = await share("a")
    await voteAll(id, [1, 1, 1, 1, 1])
    assert.equal((await vote(id, -1, "next")).rating, 25 / 6)
  })

  test("top rated uses the rating, with more votes winning a tie and unrated last", async () => {
    const few = await share("few")
    const many = await share("many")
    const good = await share("good")
    const unrated = await share("unrated")
    const bad = await share("bad")
    await voteAll(few.id, [1, 1, 1, 1, 1])
    await voteAll(many.id, [1, 1, 1, 1, 1, 1])
    await voteAll(good.id, [1, 1, 1, 1, -1])
    await voteAll(unrated.id, [1, 1, 1, 1])
    await voteAll(bad.id, [-1, -1, -1, -1, -1])
    assert.deepEqual((await list("?sort=top")).presets.map(preset => preset.text), ["many", "few", "good", "bad", "unrated"])
  })

  test("refuses other values", async () => {
    const { id } = await share("a")
    for (const value of [2, 5, -2, "1", null, true, 0.5]) assert.equal((await vote(id, value, "a")).status, 400)
  })

  test("refuses a preset that doesn't exist", async () => {
    assert.equal((await vote(999, 1, "a")).status, 404)
    assert.equal((await vote("abc", 1, "a")).status, 404)
  })

  for (const [label, gone] of [["unshared", "UPDATE presets SET shared = 0 WHERE id = ?"], ["deleted", "DELETE FROM presets WHERE id = ?"]]) {
    test(`a vote or download on a preset ${label} while it was being sent is refused`, async () => {
      for (const [send, pattern] of [[id => vote(id, 1, "a"), /preset_votes/], [id => download(id, "a"), /preset_downloads/]]) {
        const { id } = await share(`gone ${send.length} ${pattern.source}`)
        const hold = holdQuery(env, pattern)
        const sending = send(id)
        await hold.arrived
        db.prepare(gone).run(id)
        hold.release()
        assert.equal((await sending).status, 404)
        assert.equal(db.prepare("SELECT COUNT(*) AS total FROM preset_votes").get().total + db.prepare("SELECT COUNT(*) AS total FROM preset_downloads").get().total, 0)
        assert.equal(db.prepare("SELECT COALESCE(SUM(downloads + votes), 0) AS total FROM presets").get().total, 0)
      }
    })
  }
})

describe("requests from other websites", () => {
  function from(origin, path, options) {
    const made = context(path, options)
    made.request = new Request(made.request, { headers: { "CF-Connecting-IP": "1.1.1.1", Origin: origin } })
    return made
  }

  function voteFrom(origin, id) {
    return votePreset(from(origin, `/api/presets/${id}/vote`, { method: "POST", body: { value: 1 }, params: { id: String(id) } }))
  }

  test("can't vote, count a download or share for the visitor", async () => {
    const { id } = await share("a")
    for (const origin of ["https://evil.test", "https://example.test.evil.test", "http://example.test", "null"]) {
      const voted = await voteFrom(origin, id)
      assert.equal(voted.status, 403)
      assert.match((await voted.json()).error, /another website/)
    }
    assert.equal((await countDownload(from("https://evil.test", `/api/presets/${id}/download`, { method: "POST", params: { id: String(id) } }))).status, 403)
    assert.equal((await submitPreset(from("https://evil.test", "/api/presets", { method: "POST", body: { code: code([{ text: "b" }]) } }))).status, 403)
    assert.deepEqual(rowCounts(), { presets: 1, preset_votes: 0, preset_downloads: 0, preset_submissions: 1 })
  })

  test("a preview deployment can read the presets but not write to them", async () => {
    const { id } = await share("a")
    function onPreview(made) {
      made.request = new Request(made.request.url.replace("https://example.test", "https://submission-3.minecrafttitlegenerator.pages.dev"), made.request)
      return made
    }
    const voted = await votePreset(onPreview(context(`/api/presets/${id}/vote`, { method: "POST", body: { value: 1 }, params: { id: String(id) } })))
    assert.equal(voted.status, 403)
    assert.match((await voted.json()).error, /preview/)
    assert.equal((await submitPreset(onPreview(context("/api/presets", { method: "POST", body: { code: code([{ text: "b" }]) } })))).status, 403)
    assert.equal((await listPresets(onPreview(context("/api/presets")))).status, 200)
    assert.deepEqual(rowCounts(), { presets: 1, preset_votes: 0, preset_downloads: 0, preset_submissions: 1 })
  })

  test("a preview page can't write to the live site", async () => {
    const { id } = await share("a")
    for (const origin of ["https://minecrafttitlegenerator.pages.dev", "https://submission-3.minecrafttitlegenerator.pages.dev"]) assert.equal((await voteFrom(origin, id)).status, 403)
  })

  test("the site itself and local development can write", async () => {
    const { id } = await share("a")
    for (const origin of ["https://example.test", "http://localhost:9123", "http://127.0.0.1:9123"]) assert.equal((await voteFrom(origin, id)).status, 200)
    assert.equal((await vote(id, 1)).status, 200)
  })

  test("anyone can read", async () => {
    await share("a")
    assert.equal((await listPresets(from("https://evil.test", "/api/presets"))).status, 200)
  })

  function rowCounts() {
    return Object.fromEntries(["presets", "preset_votes", "preset_downloads", "preset_submissions"].map(table => [table, db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count]))
  }
})

describe("exact duplicates", () => {
  test("the same settings in a different order are a duplicate", async () => {
    const first = await post({ code: code([{ text: "same", hue: 10, texture: "grass" }]) })
    const second = await post({ code: code([{ texture: "grass", hue: 10, text: "same" }]) }, "other")
    assert.notEqual(code([{ text: "same", hue: 10, texture: "grass" }]), code([{ texture: "grass", hue: 10, text: "same" }]))
    assert.equal(second.status, 409)
    assert.equal(second.id, first.preset.id)
  })

  test("a different name doesn't make it a different title", async () => {
    await post({ code: code([{ text: "same" }]), name: "One" })
    assert.equal((await post({ code: code([{ text: "same" }]), name: "Two" }, "other")).status, 409)
  })

  for (const [label, other] of [["text", { text: "different" }], ["a setting", { text: "same", hue: 1 }], ["line order", { text: "same", type: "bottom" }]]) {
    test(`a change of ${label} is not a duplicate`, async () => {
      await post({ code: code([{ text: "same" }]) })
      assert.equal((await post({ code: code([other]) }, "other")).status, 201)
    })
  }

  test("nested settings are compared regardless of order", async () => {
    await post({ code: code([{ text: "same", overlays: [{ overlay: "dust", opacity: 5 }] }]) })
    assert.equal((await post({ code: code([{ overlays: [{ opacity: 5, overlay: "dust" }], text: "same" }]) }, "other")).status, 409)
  })

  test("the order of the lines still matters", async () => {
    await post({ code: code([{ text: "one" }, { text: "two" }]) })
    assert.equal((await post({ code: code([{ text: "two" }, { text: "one" }]) }, "other")).status, 201)
  })

  test("a duplicate doesn't use up the daily limit", async () => {
    await post({ code: code([{ text: "same" }]) }, "first")
    await post({ code: code([{ text: "same" }]) }, "second")
    assert.equal((await usageOf("second")).used, 0)
  })
})

describe("needs votes", () => {
  test("lists presets without a rating, fewest votes first and then oldest", async () => {
    const one = await share("one")
    const two = await share("two")
    const three = await share("three")
    await vote(one.id, 1, "someone")
    assert.deepEqual((await list("?sort=needs", "me")).presets.map(preset => preset.id), [two.id, three.id, one.id])
  })

  test("leaves out presets that already have a rating", async () => {
    const rated = await share("rated")
    await share("not yet")
    await voteAll(rated.id, [1, 1, 1, 1, 1])
    assert.deepEqual((await list("?sort=needs", "me")).presets.map(preset => preset.text), ["not yet"])
  })

  test("works with search", async () => {
    await share("stone")
    await share("dirt")
    assert.deepEqual((await list("?sort=needs&q=stone", "me")).presets.map(preset => preset.text), ["stone"])
  })
})

describe("random", () => {
  test("returns every preset when there are few", async () => {
    await share("one")
    await share("two")
    const { presets, more } = await list("?sort=random")
    assert.deepEqual(presets.map(preset => preset.text).sort(), ["one", "two"])
    assert.equal(more, false)
  })

  test("is empty with nothing shared", async () => {
    assert.deepEqual((await list("?sort=random")).presets, [])
  })

  test("returns at most one page, with no repeats", async () => {
    for (let index = 0; index < LIMITS.page + 10; index++) await share(`title ${index}`)
    const { presets } = await list("?sort=random")
    assert.equal(presets.length, LIMITS.page)
    assert.equal(new Set(presets.map(preset => preset.id)).size, LIMITS.page)
  })

  test("gives different presets across calls", async () => {
    for (let index = 0; index < LIMITS.page * 3; index++) await share(`title ${index}`)
    const seen = new Set()
    for (let call = 0; call < 6; call++) for (const preset of (await list("?sort=random")).presets) seen.add(preset.id)
    assert.ok(seen.size > LIMITS.page)
  })

  test("hides ratings without enough votes", async () => {
    const { id } = await share("voted")
    await vote(id, -1, "me")
    assert.equal((await list("?sort=random", "me")).presets[0].rating, null)
  })

  test("works with search", async () => {
    await share("stone")
    await share("dirt")
    assert.deepEqual((await list("?sort=random&q=dirt")).presets.map(preset => preset.text), ["dirt"])
  })

  test("doesn't treat other object properties as a sort", async () => {
    assert.equal((await list("?sort=constructor")).status, 400)
  })
})

describe("daily usage", () => {
  test("starts at nothing used", async () => {
    const { used, limit } = await usageOf("fresh")
    assert.deepEqual({ used, limit }, { used: 0, limit: 5 })
  })

  test("counts each share by this IP only", async () => {
    await post({ code: code([{ text: "one" }]) }, "sharer")
    await post({ code: code([{ text: "two" }]) }, "sharer")
    assert.equal((await usageOf("sharer")).used, 2)
    assert.equal((await usageOf("other")).used, 0)
  })

  test("does not count refused titles", async () => {
    await post({ code: code([{ text: "fuck" }]) }, "sharer")
    assert.equal((await usageOf("sharer")).used, 0)
  })

  test("resets at the next midnight UTC", async () => {
    mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-11-05T23:00:00Z") })
    try {
      assert.equal((await usageOf("sharer")).resetsAt, Date.parse("2026-11-06T00:00:00Z"))
    } finally {
      mock.timers.reset()
    }
  })
})

describe("downloads", () => {
  test("count once per IP", async () => {
    const { id } = await share("a")
    assert.equal((await download(id, "a")).counted, true)
    assert.equal((await download(id, "a")).counted, false)
    assert.equal((await download(id, "b")).counted, true)
    assert.equal((await list()).presets[0].downloads, 2)
  })

  test("refuse a preset that doesn't exist", async () => {
    assert.equal((await download(999, "a")).status, 404)
  })
})

describe("popular in the last 7 days", () => {
  const START = Date.parse("2026-11-05T12:00:00Z")
  const DAY = 86400000

  beforeEach(() => {
    mock.timers.enable({ apis: ["Date"], now: START })
  })

  afterEach(() => {
    mock.timers.reset()
  })

  function texts(body) {
    return body.presets.map(preset => preset.text)
  }

  test("sorts by this week's downloads and reports them", async () => {
    const one = await share("one")
    const two = await share("two")
    await download(one.id, "a")
    await download(two.id, "a")
    await download(two.id, "b")
    const { presets } = await list("?sort=week")
    assert.deepEqual(presets.map(preset => [preset.text, preset.week, preset.downloads]), [["two", 2, 2], ["one", 1, 1]])
  })

  test("adds up counts from different days", async () => {
    const { id } = await share("a")
    await download(id, "a")
    mock.timers.setTime(START + DAY)
    await download(id, "b")
    assert.equal((await list("?sort=week")).presets[0].week, 2)
    assert.equal(db.prepare("SELECT COUNT(*) AS rows FROM preset_daily_downloads").get().rows, 2)
  })

  test("shares a row within a day", async () => {
    const { id } = await share("a")
    await download(id, "a")
    await download(id, "b")
    assert.deepEqual({ ...db.prepare("SELECT preset_id, count FROM preset_daily_downloads").get() }, { preset_id: id, count: 2 })
  })

  test("old downloads drop out, but stay in all time", async () => {
    const old = await share("old")
    const recent = await share("recent")
    await download(old.id, "a")
    await download(old.id, "b")
    mock.timers.setTime(START + 7 * DAY)
    await download(recent.id, "a")
    assert.deepEqual(texts(await list("?sort=week")), ["old", "recent"])
    mock.timers.setTime(START + 8 * DAY)
    assert.deepEqual(texts(await list("?sort=week")), ["recent", "old"])
    assert.deepEqual((await list("?sort=week")).presets.map(preset => preset.week), [1, 0])
    assert.deepEqual(texts(await list("?sort=popular")), ["old", "recent"])
  })

  test("lists presets nobody used last, with a count of 0", async () => {
    const used = await share("used")
    await share("unused")
    await download(used.id, "a")
    assert.deepEqual((await list("?sort=week")).presets.map(preset => [preset.text, preset.week]), [["used", 1], ["unused", 0]])
  })

  test("breaks ties with all time downloads", async () => {
    const older = await share("older")
    await share("newer")
    await download(older.id, "a")
    mock.timers.setTime(START + 8 * DAY)
    assert.deepEqual(texts(await list("?sort=week")), ["older", "newer"])
  })

  test("repeat downloads from one IP don't count", async () => {
    const { id } = await share("a")
    await download(id, "a")
    await download(id, "a")
    assert.equal((await list("?sort=week")).presets[0].week, 1)
  })

  test("works with search", async () => {
    const stone = await share("stone")
    const dirt = await share("dirt")
    await download(stone.id, "a")
    await download(dirt.id, "a")
    assert.deepEqual(texts(await list("?sort=week&q=dirt")), ["dirt"])
  })

  test("pages like the other sorts", async () => {
    for (const text of ["a1", "a2", "a3"]) await download((await share(text)).id, "a")
    const original = LIMITS.page
    LIMITS.page = 2
    try {
      const first = await list("?sort=week")
      assert.equal(first.presets.length, 2)
      assert.equal(first.more, true)
      assert.equal((await list("?sort=week&offset=2")).presets.length, 1)
    } finally {
      LIMITS.page = original
    }
  })
})

describe("usage", () => {
  test("an IP links to no presets", async () => {
    await share("mine", {}, "me")
    assert.deepEqual((await usageOf("me")).shared, [])
    assert.equal(db.prepare("SELECT name FROM pragma_table_info('presets') WHERE name = 'ip_hash'").get(), undefined)
  })
})

describe("preset page details", () => {
  test("the presets page has its own title and address", () => {
    const { title, description, path } = presetPageDetails(null)
    assert.equal(title, "Presets | Minecraft Title Generator")
    assert.match(description, /other people have shared/)
    assert.equal(path, "/app/presets")
  })

  test("a preset has its name in the title, its own description and its own address", () => {
    const { title, description, path } = presetPageDetails("Iron and Ember", 12, "steve")
    assert.equal(title, "Iron and Ember | Minecraft Title Generator")
    assert.equal(description, "Iron and Ember, a Minecraft style title by steve. Open it in the Minecraft Title Generator to change it and make your own!")
    assert.equal(path, "/app/presets/12")
    assert.match(presetPageDetails("Iron and Ember", 12).description, /^Iron and Ember, a Minecraft style title shared by the community\./)
  })

  test("a preset page describes the title and where it sits as structured data", () => {
    const details = presetDetails("https://mctitlegenerator.com", { name: "Iron and Ember", fingerprint: "abc", author: "steve", createdAt: Date.UTC(2026, 10, 5) }, 12)
    const [, , work, trail] = details.data["@graph"]
    assert.equal(details.heading, "Iron and Ember")
    assert.equal(details.alt, "A preview of the Iron and Ember title")
    assert.deepEqual([work["@type"], work.name, work.url, work.image, work.author.name, work.datePublished], ["CreativeWork", "Iron and Ember", "https://mctitlegenerator.com/app/presets/12", details.image, "steve", "2026-11-05T00:00:00.000Z"])
    assert.deepEqual(trail.itemListElement.map(step => step.name), ["Minecraft Title Generator", "Presets", "Iron and Ember"])
    assert.equal(presetDetails("https://mctitlegenerator.com", null, 4).data["@graph"][2]["@type"], "CollectionPage")
  })
})

describe("a preset by fingerprint", () => {
  async function fetched(fingerprint) {
    const response = await listPresets(context(`/api/presets?fingerprint=${fingerprint}`))
    return (await response.json()).presets
  }

  test("is listed on its own", async () => {
    await share("dirt")
    const { id } = await share("stone")
    const { code: shared, fingerprint } = db.prepare("SELECT code, fingerprint FROM presets WHERE id = ?").get(id)
    const presets = await fetched(fingerprint)
    assert.equal(presets.length, 1)
    assert.equal(presets[0].code, shared)
  })

  test("differs for each camera angle and stays the same for the default camera", async () => {
    const fingerprintOf = async body => db.prepare("SELECT fingerprint FROM presets WHERE id = ?").get((await post(body, `${Math.random()}`)).preset.id).fingerprint
    const plain = await fingerprintOf({ code: code([{ text: "plain" }]) })
    db.exec("DELETE FROM presets")
    const defaulted = await fingerprintOf({ code: encodeTitle({ version: FILE_VERSION, lines: [{ text: "plain" }], camera: { fov: 43 } }).code })
    db.exec("DELETE FROM presets")
    const front = await fingerprintOf({ code: encodeTitle({ version: FILE_VERSION, lines: [{ text: "plain" }], camera: { pitch: 0, tilt: 0, fov: 0 } }).code })
    db.exec("DELETE FROM presets")
    const turned = await fingerprintOf({ code: encodeTitle({ version: FILE_VERSION, lines: [{ text: "plain" }], camera: { pitch: 0, tilt: 0, fov: 0, yaw: 20 } }).code })
    assert.equal(defaulted, plain)
    assert.notEqual(front, plain)
    assert.notEqual(turned, front)
  })

  test("lists nothing for an unknown fingerprint", async () => {
    assert.deepEqual(await fetched("0".repeat(64)), [])
  })

  test("comes with the preset list", async () => {
    const { id } = await share("stone")
    const { fingerprint } = db.prepare("SELECT fingerprint FROM presets WHERE id = ?").get(id)
    assert.equal((await list()).presets[0].fingerprint, fingerprint)
  })
})

describe("a single preset", () => {
  async function fetched(id) {
    const response = await getPreset(context(`/api/presets/${id}`, { params: { id: String(id) } }))
    return { status: response.status, ...await response.json() }
  }

  test("is returned with its numbers and without its sharer", async () => {
    const { id } = await share("stone", { name: "Castle" })
    const { status, preset } = await fetched(id)
    assert.equal(status, 200)
    assert.equal(preset.name, "Castle")
    assert.equal(preset.rating, null)
    assert.equal("ip_hash" in preset, false)
  })

  test("is a 404 when it doesn't exist or the id is bad", async () => {
    assert.equal((await fetched(999)).status, 404)
    assert.equal((await fetched("abc")).status, 404)
  })

  test("doesn't cache a 404", async () => {
    const entries = new Map()
    globalThis.caches = { default: { match: async request => entries.get(request.url)?.clone(), put: async (request, response) => { entries.set(request.url, response) }, delete: async () => {} } }
    try {
      await fetched(999)
      assert.equal(entries.size, 0)
    } finally {
      delete globalThis.caches
    }
  })
})

describe("sharing and the edge cache", () => {
  test("clears the first page of each sort there", async () => {
    const deleted = []
    globalThis.caches = { default: { match: async () => undefined, put: async () => {}, delete: async request => deleted.push(request.url) } }
    try {
      await share("a")
      assert.deepEqual(deleted, ["week", "popular", "top", "new", "needs"].map(sort => `https://example.test/api/presets?sort=${sort}&offset=0`))
    } finally {
      delete globalThis.caches
    }
  })
})

describe("preset stats", () => {
  async function statsOf(ids) {
    const response = await presetStats(context(`/api/presets/stats?ids=${ids}`))
    return { status: response.status, ...await response.json() }
  }

  test("returns the figures for each id, without the title", async () => {
    const first = await share("first")
    const second = await share("second")
    await download(first.id, "someone")
    const { stats } = await statsOf(`${first.id},${second.id}`)
    assert.equal(stats[first.id].downloads, 1)
    assert.equal(stats[first.id].rating, null)
    assert.equal(stats[second.id].downloads, 0)
    assert.equal(stats[first.id].code, undefined)
    assert.equal(stats[first.id].createdAt, first.createdAt)
  })

  test("a rating shows once there are enough votes", async () => {
    const { id } = await share("rated")
    await voteAll(id, Array(LIMITS.minVotes).fill(1))
    assert.equal((await statsOf(id)).stats[id].rating, 5)
  })

  test("leaves out a preset that no longer exists", async () => {
    const { id } = await share("here")
    assert.deepEqual(Object.keys((await statsOf(`${id},999`)).stats), [String(id)])
  })

  test("no ids is an empty answer", async () => {
    assert.deepEqual((await statsOf("")).stats, {})
  })

  test("refuses bad ids and too many", async () => {
    assert.equal((await statsOf("1,abc")).status, 400)
    assert.equal((await statsOf("1) OR (1=1")).status, 400)
    assert.equal((await statsOf(Array.from({ length: LIMITS.savedPresets + 1 }, (_, index) => index + 1).join(","))).status, 400)
  })
})

