import { afterEach, beforeEach, describe, mock, test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import { DatabaseSync } from "node:sqlite"

const { LIMITS, checkTitle, countDownload, listPresets, submissionUsage, submitPreset, titleFacts, votePreset } = await import("../src/server/presets.js")
const { encodeTitle } = await import("../src/lib/linkformat.js")
const { FILE_VERSION } = await import("../src/lib/settings.js")

function d1(sqlite) {
  function statement(sql, values = []) {
    return {
      bind: (...next) => statement(sql, next),
      all: async () => ({ results: sqlite.prepare(sql).all(...values) }),
      first: async () => sqlite.prepare(sql).get(...values) ?? null,
      run: async () => {
        const { changes } = sqlite.prepare(sql).run(...values)
        return { meta: { changes: Number(changes) } }
      },
      execute() {
        return /RETURNING/.test(sql) ? { results: sqlite.prepare(sql).all(...values) } : { results: [], meta: { changes: Number(sqlite.prepare(sql).run(...values).changes) } }
      }
    }
  }
  return {
    prepare: sql => statement(sql),
    batch: async statements => {
      sqlite.exec("BEGIN")
      try {
        const results = statements.map(item => item.execute())
        sqlite.exec("COMMIT")
        return results
      } catch (err) {
        sqlite.exec("ROLLBACK")
        throw err
      }
    }
  }
}

let db
let env

function code(lines, version = FILE_VERSION) {
  return encodeTitle({ version, lines }).code
}

function context(path, { ip = "1.1.1.1", body, params = {}, method = "GET" } = {}) {
  const request = new Request(`https://example.test${path}`, { method, headers: { "CF-Connecting-IP": ip }, body: body === undefined ? undefined : JSON.stringify(body) })
  return { request, env, params }
}

async function post(body, ip) {
  const response = await submitPreset(context("/api/presets", { method: "POST", body, ip }))
  return { status: response.status, ...await response.json() }
}

async function list(query = "", ip) {
  const response = await listPresets(context(`/api/presets${query}`, { ip }))
  return { status: response.status, ...await response.json() }
}

async function vote(id, value, ip) {
  const response = await votePreset(context(`/api/presets/${id}/vote`, { method: "POST", body: { value }, ip, params: { id: String(id) } }))
  return { status: response.status, ...await response.json() }
}

async function voteAll(id, values) {
  for (const [index, value] of values.entries()) await vote(id, value, `voter ${index}`)
}

async function usageOf(ip) {
  const response = await submissionUsage(context("/api/presets/usage", { ip }))
  return { status: response.status, ...await response.json() }
}

async function download(id, ip) {
  const response = await countDownload(context(`/api/presets/${id}/download`, { method: "POST", ip, params: { id: String(id) } }))
  return { status: response.status, ...await response.json() }
}

async function share(text, extra = {}, ip = `${Math.random()}`) {
  return (await post({ code: code([{ text }]), ...extra }, ip)).preset
}

beforeEach(() => {
  const sqlite = new DatabaseSync(":memory:")
  sqlite.exec(fs.readFileSync("migrations/0001_community_presets.sql", "utf8"))
  db = sqlite
  env = { DB: d1(sqlite), IP_SALT: "salt" }
})

describe("titleFacts", () => {
  test("joins lines, and words by their spaces", () => {
    const facts = titleFacts([{ text: "top" }, { words: [{ text: "one" }, { text: "two", spaceBefore: true }, { text: "three" }] }])
    assert.equal(facts.text, "top one twothree")
    assert.equal(facts.words, 4)
  })

  test("a line with no text uses the default text", () => {
    assert.equal(titleFacts([{ texture: "cracked" }]).text, "minecraft")
  })

  test("a hidden line stays out of the search text but is still checked", () => {
    const facts = titleFacts([{ text: "shown" }, { text: "hidden", hidden: true }])
    assert.equal(facts.text, "shown")
    assert.equal(facts.all, "shown hidden")
  })

  test("counts characters, not bytes", () => {
    assert.equal(titleFacts([{ text: "é😀" }]).characters, 2)
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

  test("allows 5 a day per IP", async () => {
    for (let index = 0; index < 5; index++) assert.equal((await post({ code: code([{ text: `a${index}` }]) }, "9.9.9.9")).status, 201)
    const refused = await post({ code: code([{ text: "a5" }]) }, "9.9.9.9")
    assert.equal(refused.status, 429)
    assert.match(refused.error, /up to 5 titles a day/)
    assert.equal((await post({ code: code([{ text: "a5" }]) }, "8.8.8.8")).status, 201)
  })

  test("refused titles do not use up the daily limit", async () => {
    for (let index = 0; index < 6; index++) await post({ code: code([{ text: "fuck" }]) }, "7.7.7.7")
    assert.equal((await post({ code: code([{ text: "fine" }]) }, "7.7.7.7")).status, 201)
  })

  test("the limit starts again the next day", async () => {
    mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-11-05T23:00:00Z") })
    try {
      for (let index = 0; index < 5; index++) await post({ code: code([{ text: `b${index}` }]) }, "6.6.6.6")
      assert.equal((await post({ code: code([{ text: "b5" }]) }, "6.6.6.6")).status, 429)
      mock.timers.setTime(Date.parse("2026-11-06T01:00:00Z"))
      assert.equal((await post({ code: code([{ text: "b5" }]) }, "6.6.6.6")).status, 201)
    } finally {
      mock.timers.reset()
    }
  })

  test("never stores an IP address, only its hash", async () => {
    await post({ code: code([{ text: "a" }]) }, "123.45.67.89")
    const [row] = db.prepare("SELECT ip_hash FROM preset_submissions").all()
    assert.equal(row.ip_hash.length, 64)
    assert.equal(row.ip_hash.includes("123.45"), false)
  })

  test("a missing salt fails loudly rather than storing unsalted hashes", async () => {
    env.IP_SALT = ""
    await assert.rejects(post({ code: code([{ text: "a" }]) }), /IP_SALT is not set/)
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

  test("refuses a search shorter than 2 characters", async () => {
    await share("stone")
    assert.match((await list("?q=s")).error, /at least 2/)
    assert.equal((await list("?q=st")).presets.length, 1)
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
      assert.equal(entries.values().next().value.headers.get("Cache-Control"), "public, max-age=300")
    })

    test("refusals aren't cached", async () => {
      await list("?q=x")
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

  test("refuses a vote on a preset you shared, either way", async () => {
    const { id } = await share("mine", {}, "me")
    assert.equal((await vote(id, 1, "me")).status, 403)
    assert.equal((await vote(id, -1, "me")).status, 403)
    assert.equal(db.prepare("SELECT votes FROM presets WHERE id = ?").get(id).votes, 0)
    assert.equal(db.prepare("SELECT COUNT(*) AS rows FROM preset_votes").get().rows, 0)
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

  for (const [label, other] of [["text", { text: "Same" }], ["a setting", { text: "same", hue: 1 }], ["line order", { text: "same", type: "bottom" }]]) {
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

describe("sharing and the edge cache", () => {
  test("clears the first Newest page there", async () => {
    const deleted = []
    globalThis.caches = { default: { match: async () => undefined, put: async () => {}, delete: async request => deleted.push(request.url) } }
    try {
      await share("a")
      assert.deepEqual(deleted, ["https://example.test/api/presets?sort=new&offset=0"])
    } finally {
      delete globalThis.caches
    }
  })
})
