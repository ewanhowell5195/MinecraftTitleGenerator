import { afterEach, beforeEach, describe, mock, test } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import { DatabaseSync } from "node:sqlite"

const { LIMITS, checkTitle, claimPresets, countDownload, deletePreset, getPreset, listPresets, presetPageDetails, renamePreset, submissionUsage, submitPreset, titleFacts, votePreset } = await import("../src/server/presets.js")
const { accountDetails, finishSignIn, receiveSignIn, signOut, startSignIn } = await import("../src/server/accounts.js")
const { addSaved, changeSaved, listSaved, removeSaved } = await import("../src/server/saved.js")
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
  sqlite.exec(fs.readFileSync("migrations/0002_accounts.sql", "utf8"))
  sqlite.exec(fs.readFileSync("migrations/0003_saved_presets.sql", "utf8"))
  sqlite.exec(fs.readFileSync("migrations/0004_votes_by_voter.sql", "utf8"))
  sqlite.exec(fs.readFileSync("migrations/0005_users.sql", "utf8"))
  sqlite.exec(fs.readFileSync("migrations/0006_unlimited_shares.sql", "utf8"))
  sqlite.exec(fs.readFileSync("migrations/0007_preset_tokens.sql", "utf8"))
  db = sqlite
  env = { DB: d1(sqlite), IP_SALT: "salt", SESSION_SECRET: "session-secret", DISCORD_CLIENT_ID: "discord-id", DISCORD_CLIENT_SECRET: "discord-secret", GITHUB_CLIENT_ID: "github-id", GITHUB_CLIENT_SECRET: "github-secret" }
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
      assert.equal(entries.values().next().value.headers.get("Cache-Control"), "public, max-age=1800")
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
    assert.match(description, /shared by other people/)
    assert.equal(path, "/app/presets")
  })

  test("a preset has its name in the title and its own address", () => {
    const { title, description, path } = presetPageDetails("Iron and Ember", 12)
    assert.equal(title, "Iron and Ember | Minecraft Title Generator")
    assert.match(description, /Open Iron and Ember in the/)
    assert.equal(path, "/app/presets/12")
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

describe("accounts", () => {
  const realFetch = globalThis.fetch
  const realNow = Date.now.bind(Date)
  let calls

  function withCookie(path, cookie, options = {}) {
    const made = context(path, options)
    made.request = new Request(made.request, { headers: { "CF-Connecting-IP": options.ip ?? "1.1.1.1", Cookie: cookie } })
    return made
  }

  function stubProvider(profile, token = { access_token: "token" }) {
    calls = []
    globalThis.fetch = async (url, options) => {
      calls.push({ url, options })
      const body = options?.method === "POST" ? token : profile
      return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } })
    }
  }

  function cookiePair(response, name) {
    return response.headers.getSetCookie().find(line => line.startsWith(`${name}=`)).split(";")[0]
  }

  async function begin(provider = "discord", origin = "https://mctitlegenerator.com") {
    const response = await startSignIn(context(`/api/account/login/${provider}?return=${encodeURIComponent(origin)}`, { params: { provider } }))
    return { response, state: new URL(response.headers.get("Location")).searchParams.get("state"), cookie: cookiePair(response, "signin_state") }
  }

  function atProvider(provider, query) {
    return receiveSignIn(context(`/api/account/login/${provider}/callback?${new URLSearchParams(query)}`, { params: { provider } }))
  }

  function finishing(location, cookie, provider = "discord") {
    const { pathname, search } = new URL(location)
    return finishSignIn(withCookie(`${pathname}${search}`, cookie, { params: { provider } }))
  }

  async function signIn(provider = "discord", profile = { id: "1234", username: "someone", global_name: "Fake Name" }) {
    stubProvider(profile)
    const { state, cookie } = await begin(provider)
    const back = await atProvider(provider, { code: "abc", state })
    const response = await finishing(back.headers.get("Location"), cookie, provider)
    assert.equal(response.status, 200)
    return cookiePair(response, "session")
  }

  async function shareAs(cookie, text, extra = {}, ip = "1.1.1.1") {
    const response = await submitPreset(withCookie("/api/presets", cookie, { method: "POST", body: { code: code([{ text }]), ...extra }, ip }))
    return { status: response.status, ...await response.json() }
  }

  async function rename(cookie, id, name) {
    const made = withCookie(`/api/presets/${id}`, cookie, { method: "PATCH", body: { name }, params: { id: String(id) } })
    const response = await renamePreset(made)
    return { status: response.status, ...await response.json() }
  }

  async function remove(cookie, id) {
    return (await deletePreset(withCookie(`/api/presets/${id}`, cookie, { method: "DELETE", params: { id: String(id) } }))).status
  }

  afterEach(() => {
    globalThis.fetch = realFetch
  })

  test("starting a sign-in redirects with the one registered callback and keeps a secure nonce cookie", async () => {
    const { response } = await begin()
    assert.equal(response.status, 302)
    const target = new URL(response.headers.get("Location"))
    assert.equal(target.origin + target.pathname, "https://discord.com/oauth2/authorize")
    assert.equal(target.searchParams.get("client_id"), "discord-id")
    assert.equal(target.searchParams.get("scope"), "identify")
    assert.equal(target.searchParams.get("redirect_uri"), "https://mctitlegenerator.com/api/account/login/discord/callback")
    assert.match(response.headers.get("Set-Cookie"), /^signin_state=[0-9a-f]{64};.*HttpOnly; Secure; SameSite=Lax/)
  })

  for (const origin of ["https://mctitlegenerator.com", "https://minecrafttitlegenerator.pages.dev", "https://abc123.minecrafttitlegenerator.pages.dev", "https://dev.ewanhowell.com", "http://localhost:9123", "http://127.0.0.1:9123"]) {
    test(`signs in from ${origin} and hands back there`, async () => {
      stubProvider({ id: "1", username: "a" })
      const { state, cookie } = await begin("discord", origin)
      const back = await atProvider("discord", { code: "abc", state })
      assert.equal(back.status, 302)
      assert.ok(back.headers.get("Location").startsWith(`${origin}/api/account/login/discord/finish?handoff=`))
      assert.equal(calls[0].options.body.get("redirect_uri"), "https://mctitlegenerator.com/api/account/login/discord/callback")
      const finished = await finishing(back.headers.get("Location"), cookie)
      assert.equal((await who(cookiePair(finished, "session"))).name, "a")
    })
  }

  for (const origin of ["https://evil.test", "https://mctitlegenerator.com.evil.test", "https://evilminecrafttitlegenerator.pages.dev", "http://minecrafttitlegenerator.pages.dev", "http://dev.ewanhowell.com", "javascript:alert(1)"]) {
    test(`refuses to sign in for ${origin}`, async () => {
      const response = await startSignIn(context(`/api/account/login/discord?return=${encodeURIComponent(origin)}`, { params: { provider: "discord" } }))
      assert.equal(response.status, 400)
    })
  }

  test("with no return address it uses the address it was asked on", async () => {
    stubProvider({ id: "1", username: "a" })
    assert.equal((await startSignIn(context("/api/account/login/discord", { params: { provider: "discord" } }))).status, 400)
    const made = context("/api/account/login/discord", { params: { provider: "discord" } })
    made.request = new Request("https://mctitlegenerator.com/api/account/login/discord")
    assert.equal((await startSignIn(made)).status, 302)
  })

  test("a handoff needs the nonce cookie from the browser that started", async () => {
    stubProvider({ id: "1", username: "a" })
    const { state } = await begin()
    const back = await atProvider("discord", { code: "abc", state })
    const other = await begin()
    assert.equal((await finishing(back.headers.get("Location"), other.cookie)).status, 400)
    assert.equal((await finishing(back.headers.get("Location"), "unrelated=1")).status, 400)
  })

  test("a handoff expires quickly", async () => {
    stubProvider({ id: "1", username: "a" })
    const { state, cookie } = await begin()
    const back = await atProvider("discord", { code: "abc", state })
    const later = mock.method(Date, "now", () => realNow() + 61000)
    try {
      assert.equal((await finishing(back.headers.get("Location"), cookie)).status, 400)
    } finally {
      later.mock.restore()
    }
  })

  test("a signed value only works for its own purpose", async () => {
    stubProvider({ id: "1", username: "a" })
    const { state, cookie } = await begin()
    const back = await atProvider("discord", { code: "abc", state })
    const handoff = new URL(back.headers.get("Location")).searchParams.get("handoff")
    assert.equal(await who(`session=${state}`), null)
    assert.equal(await who(`session=${handoff}`), null)
    assert.equal((await atProvider("discord", { code: "abc", state: handoff })).status, 400)
    assert.equal((await finishing(`https://example.test/api/account/login/discord/finish?handoff=${encodeURIComponent(state)}`, cookie)).status, 400)
    const session = await signIn()
    assert.equal((await atProvider("discord", { code: "abc", state: session.split("=")[1] })).status, 400)
  })

  test("a changed state is refused", async () => {
    const { state } = await begin("discord", "http://localhost:9123")
    const changed = state.replace("localhost%3A9123", "evil.test")
    assert.notEqual(changed, state)
    assert.equal((await atProvider("discord", { code: "abc", state: changed })).status, 400)
  })

  test("an unknown provider is refused", async () => {
    assert.equal((await startSignIn(context("/api/account/login/nope", { params: { provider: "nope" } }))).status, 404)
  })

  test("a provider with no secret fails with the setting's name", async () => {
    delete env.GITHUB_CLIENT_SECRET
    await assert.rejects(startSignIn(context("/api/account/login/github", { params: { provider: "github" } })), /GITHUB_CLIENT_SECRET is not set/)
  })

  test("a callback with a made up state is refused and calls nothing", async () => {
    stubProvider({})
    const response = await atProvider("discord", { code: "abc", state: "other" })
    assert.equal(response.status, 400)
    assert.equal(calls.length, 0)
  })

  test("cancelling at the provider goes back to where it started and creates nothing", async () => {
    const { state, cookie } = await begin("discord", "https://dev.ewanhowell.com")
    const back = await atProvider("discord", { error: "access_denied", state })
    assert.equal(back.headers.get("Location"), "https://dev.ewanhowell.com/api/account/login/discord/finish?cancelled=1")
    const response = await finishing(back.headers.get("Location"), cookie)
    assert.equal(response.status, 200)
    assert.equal(response.headers.getSetCookie().length, 0)
  })

  test("a provider's error is shown, escaped", async () => {
    stubProvider({}, { error: "bad_verification_code", error_description: "<bad> code" })
    const { state } = await begin("github")
    const response = await atProvider("github", { code: "abc", state })
    assert.equal(response.status, 502)
    assert.match(await response.text(), /GitHub couldn't sign you in: &#60;bad&#62; code/)
  })

  async function who(cookie) {
    return (await (await accountDetails(withCookie("/api/account", cookie))).json()).user
  }

  function rowsEverywhere() {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map(table => table.name)
    return Object.fromEntries(tables.map(table => [table, db.prepare(`SELECT COUNT(*) AS total FROM ${table}`).get().total]).filter(([, total]) => total))
  }

  test("sends the secret and code to the provider", async () => {
    await signIn()
    const form = calls[0].options.body
    assert.equal(calls[0].url, "https://discord.com/api/oauth2/token")
    assert.equal(form.get("client_secret"), "discord-secret")
    assert.equal(form.get("code"), "abc")
    assert.equal(calls[1].options.headers.Authorization, "Bearer token")
  })

  test("the finished sign-in tells other tabs, then closes or goes back", async () => {
    stubProvider({ id: "1", username: "a" })
    const { state, cookie } = await begin()
    const back = await atProvider("discord", { code: "abc", state })
    const response = await finishing(back.headers.get("Location"), cookie)
    assert.deepEqual(response.headers.getSetCookie().map(line => line.split("=")[0]), ["session", "signin_state"])
    const html = await response.text()
    assert.match(html, /new BroadcastChannel\("minecraft-title-account"\)\.postMessage\("changed"\)/)
    assert.match(html, /sessionStorage\.getItem\("minecraft-title-sign-in-return"\)/)
    assert.match(html, /location\.replace\(back\);else window\.close\(\)/)
  })

  test("signing in stores nothing on the server", async () => {
    await signIn()
    assert.deepEqual(rowsEverywhere(), {})
  })

  test("github uses the numeric id and the login, not the changeable display name", async () => {
    const cookie = await signIn("github", { id: 42, login: "octo", name: "Fake Name" })
    assert.deepEqual(await who(cookie), { id: "github:42", name: "octo", provider: "github" })
  })

  test("discord uses the username, not the display name", async () => {
    assert.equal((await who(await signIn())).name, "someone")
  })

  test("the same id on another provider is another account", async () => {
    const discord = await signIn("discord", { id: "1", username: "a" })
    const github = await signIn("github", { id: 1, login: "b" })
    const { preset } = await shareAs(discord, "theirs")
    assert.equal((await rename(github, preset.id, "stolen")).status, 403)
  })

  test("the account route says who is signed in and which sign-ins are set up", async () => {
    delete env.GITHUB_CLIENT_ID
    const cookie = await signIn()
    const details = await (await accountDetails(withCookie("/api/account", cookie))).json()
    assert.equal(details.user.name, "someone")
    assert.deepEqual(details.providers, ["discord"])
    assert.deepEqual(await (await accountDetails(context("/api/account"))).json(), { user: null, providers: ["discord"] })
  })

  test("signing out clears the session cookie", async () => {
    const cookie = await signIn()
    const response = await signOut(withCookie("/api/account/logout", cookie, { method: "POST" }))
    assert.match(response.headers.get("Set-Cookie"), /^session=; .*Max-Age=0/)
  })

  test("an expired session counts as signed out", async () => {
    const cookie = await signIn()
    const later = mock.method(Date, "now", () => Date.parse("2999-01-01"))
    try {
      assert.equal(await who(cookie), null)
    } finally {
      later.mock.restore()
    }
  })

  test("a changed session cookie counts as signed out", async () => {
    const cookie = await signIn()
    assert.equal(await who(cookie.replace("someone", "somebody")), null)
    assert.equal(await who(`${cookie.slice(0, -2)}00`), null)
    assert.equal(await who("session=nonsense"), null)
  })

  test("a session signed with another secret counts as signed out", async () => {
    const cookie = await signIn()
    env.SESSION_SECRET = "other"
    assert.equal(await who(cookie), null)
  })

  test("a session with no secret set fails with the setting's name", async () => {
    const cookie = await signIn()
    delete env.SESSION_SECRET
    await assert.rejects(accountDetails(withCookie("/api/account", cookie)), /SESSION_SECRET is not set/)
  })

  test("a signed in share goes on the account and shows the username, not the id", async () => {
    const cookie = await signIn()
    const { status, preset, onAccount } = await shareAs(cookie, "mine")
    assert.equal(status, 201)
    assert.equal(onAccount, true)
    assert.equal(preset.user_id, undefined)
    assert.equal(preset.author, "someone")
    assert.equal(preset.authorProvider, "discord")
    assert.deepEqual({ ...db.prepare("SELECT provider, provider_id, users.name FROM users JOIN presets ON presets.user_id = users.id").get() }, { provider: "discord", provider_id: "1234", name: "someone" })
  })

  test("a user row only exists while it has a shared or saved preset", async () => {
    const cookie = await signIn()
    const users = () => db.prepare("SELECT COUNT(*) AS total FROM users").get().total
    assert.equal(users(), 0)
    const { preset } = await shareAs(cookie, "first")
    const { preset: second } = await shareAs(cookie, "second")
    assert.equal(users(), 1)
    const saved = { name: "private", code: code([{ text: "private" }]) }
    await addSaved(withCookie("/api/saved", cookie, { method: "POST", body: { presets: [saved] } }))
    assert.equal(users(), 1)
    await remove(cookie, preset.id)
    await remove(cookie, second.id)
    assert.equal(users(), 1)
    await removeSaved(withCookie("/api/saved", cookie, { method: "DELETE", body: { code: saved.code } }))
    assert.equal(users(), 0)
  })

  test("saving without sharing makes a user, and nothing to save makes none", async () => {
    const cookie = await signIn()
    const users = () => db.prepare("SELECT COUNT(*) AS total FROM users").get().total
    await addSaved(withCookie("/api/saved", cookie, { method: "POST", body: { presets: [{ name: "bad", code: "!!!" }] } }))
    assert.equal(users(), 0)
    await addSaved(withCookie("/api/saved", cookie, { method: "POST", body: { presets: [{ name: "good", code: code([{ text: "good" }]) }] } }))
    assert.equal(users(), 1)
  })

  test("a refused share makes no user", async () => {
    const cookie = await signIn()
    await post({ code: code([{ text: "taken" }]) })
    assert.equal((await shareAs(cookie, "taken")).status, 409)
    assert.equal(db.prepare("SELECT COUNT(*) AS total FROM users").get().total, 0)
  })

  test("a changed username updates one row and shows on every preset", async () => {
    const before = await signIn("discord", { id: "1", username: "old" })
    await shareAs(before, "one")
    await shareAs(before, "two")
    const changed = []
    const realPrepare = env.DB.prepare
    env.DB.prepare = sql => {
      if (/^UPDATE/.test(sql)) changed.push(sql)
      return realPrepare(sql)
    }
    await signIn("discord", { id: "1", username: "new" })
    env.DB.prepare = realPrepare
    assert.equal(changed.length, 1)
    assert.match(changed[0], /^UPDATE users/)
    assert.deepEqual((await list("?sort=new")).presets.map(preset => preset.author), ["new", "new"])
  })

  test("sharing with a session from before a username change keeps the row up to date", async () => {
    const first = await signIn("discord", { id: "1", username: "first" })
    await shareAs(first, "one")
    const second = await signIn("discord", { id: "1", username: "second" })
    await shareAs(second, "two")
    assert.deepEqual(db.prepare("SELECT name FROM users").all().map(row => row.name), ["second"])
  })

  describe("the users migration", () => {
    test("moves accounts and presets across and drops the old columns", () => {
      const sqlite = new DatabaseSync(":memory:")
      for (const file of ["0001_community_presets", "0002_accounts", "0003_saved_presets", "0004_votes_by_voter"]) sqlite.exec(fs.readFileSync(`migrations/${file}.sql`, "utf8"))
      const insert = sqlite.prepare("INSERT INTO presets (id, code, fingerprint, name, text, ip_hash, created_at, author, author_provider, author_id) VALUES (?, 'c', ?, 'n', 't', 'ip', ?, ?, ?, ?)")
      insert.run(1, "a", 100, "someone", "discord", "discord:519")
      insert.run(2, "b", 50, "someone", "discord", "discord:519")
      insert.run(3, "c", 70, "octo", "github", "github:42")
      insert.run(4, "d", 80, null, null, null)
      sqlite.prepare("INSERT INTO saved_presets (author_id, code_hash, code, name, shared) VALUES (?, ?, ?, ?, ?)").run("discord:519", "h1", "code1", "saved one", 1)
      sqlite.prepare("INSERT INTO saved_presets (author_id, code_hash, code, name, shared) VALUES (?, ?, ?, ?, ?)").run("discord:777", "h2", "code2", "saved only", null)
      sqlite.exec(fs.readFileSync("migrations/0005_users.sql", "utf8"))
      assert.deepEqual(sqlite.prepare("SELECT provider, provider_id, name, created_at FROM users ORDER BY provider, provider_id").all().map(row => ({ ...row })), [
        { provider: "discord", provider_id: "519", name: "someone", created_at: 50 },
        { provider: "discord", provider_id: "777", name: "777", created_at: 0 },
        { provider: "github", provider_id: "42", name: "octo", created_at: 70 }
      ])
      assert.deepEqual(sqlite.prepare("SELECT presets.id, users.name FROM presets LEFT JOIN users ON users.id = presets.user_id ORDER BY presets.id").all().map(row => [row.id, row.name]), [[1, "someone"], [2, "someone"], [3, "octo"], [4, null]])
      assert.deepEqual(sqlite.prepare("SELECT saved_presets.name, users.provider_id, shared FROM saved_presets JOIN users ON users.id = saved_presets.user_id ORDER BY saved_presets.id").all().map(row => [row.name, row.provider_id, row.shared]), [["saved one", "519", 1], ["saved only", "777", null]])
      const columns = sqlite.prepare("SELECT name FROM pragma_table_info('presets')").all().map(row => row.name)
      assert.equal(columns.includes("author"), false)
      assert.equal(columns.includes("author_id"), false)
      assert.equal(columns.includes("user_id"), true)
    })
  })

  test("an anonymous share has no account or author", async () => {
    const { onAccount, preset } = await post({ code: code([{ text: "anon" }]) })
    assert.equal(onAccount, false)
    assert.equal(preset.author, null)
    assert.equal(preset.authorProvider, null)
    assert.equal(db.prepare("SELECT user_id FROM presets WHERE id = ?").get(preset.id).user_id, null)
    assert.equal(db.prepare("SELECT COUNT(*) AS total FROM users").get().total, 0)
  })

  test("lists, the weekly sort, single presets and renames all carry the author", async () => {
    const cookie = await signIn()
    const { preset } = await shareAs(cookie, "listed")
    for (const sort of ["week", "popular", "top", "new", "needs", "random"]) assert.equal((await list(`?sort=${sort}`)).presets[0].author, "someone", sort)
    const single = await getPreset(context(`/api/presets/${preset.id}`, { params: { id: String(preset.id) } }))
    assert.equal((await single.json()).preset.author, "someone")
    assert.equal((await rename(cookie, preset.id, "renamed")).preset.author, "someone")
  })

  test("signing in with a new username updates presets already shared", async () => {
    const cookie = await signIn("discord", { id: "1", username: "old" })
    const { preset } = await shareAs(cookie, "kept")
    await signIn("discord", { id: "1", username: "new" })
    assert.equal((await list("?sort=new")).presets.find(item => item.id === preset.id).author, "new")
  })

  test("a rude username can't share on its account, but can still share anonymously", async () => {
    const cookie = await signIn("discord", { id: "1", username: "fuck" })
    const { status, error } = await shareAs(cookie, "clean")
    assert.equal(status, 400)
    assert.match(error, /username/)
    assert.equal((await post({ code: code([{ text: "clean" }]) })).status, 201)
  })

  test("asking for an account with an expired session refuses instead of sharing anonymously", async () => {
    const { status } = await post({ code: code([{ text: "kept" }]), account: true })
    assert.equal(status, 401)
    assert.equal(db.prepare("SELECT COUNT(*) AS total FROM presets").get().total, 0)
  })

  test("the daily limit follows the account across IPs", async () => {
    const cookie = await signIn()
    for (let index = 0; index < LIMITS.perDay; index++) assert.equal((await shareAs(cookie, `title ${index}`, {}, `ip ${index}`)).status, 201)
    assert.equal((await shareAs(cookie, "one more", {}, "fresh ip")).status, 429)
  })

  test("a user with unlimited shares can go past the daily limit", async () => {
    const cookie = await signIn()
    for (let index = 0; index < LIMITS.perDay; index++) await shareAs(cookie, `title ${index}`)
    assert.equal((await shareAs(cookie, "refused")).status, 429)
    assert.equal((await usageAs(cookie)).unlimited, false)
    db.prepare("UPDATE users SET unlimited_shares = 1").run()
    assert.equal((await shareAs(cookie, "allowed")).status, 201)
    const usage = await usageAs(cookie)
    assert.equal(usage.unlimited, true)
    assert.equal(usage.used, LIMITS.perDay + 1)
  })

  test("unlimited shares don't carry over to anyone else", async () => {
    const lifted = await signIn("discord", { id: "1", username: "a" })
    const other = await signIn("discord", { id: "2", username: "b" })
    await shareAs(lifted, "first")
    db.prepare("UPDATE users SET unlimited_shares = 1").run()
    for (let index = 0; index < LIMITS.perDay; index++) await shareAs(other, `title ${index}`)
    assert.equal((await shareAs(other, "refused")).status, 429)
    for (let index = 0; index < LIMITS.perDay; index++) await post({ code: code([{ text: `anon ${index}` }]) }, "1.1.1.1")
    assert.equal((await post({ code: code([{ text: "anon refused" }]) }, "1.1.1.1")).status, 429)
    assert.equal((await usageOf("1.1.1.1")).unlimited, false)
  })

  test("account shares do not use up the IP's anonymous limit", async () => {
    const cookie = await signIn()
    for (let index = 0; index < LIMITS.perDay; index++) await shareAs(cookie, `title ${index}`)
    assert.equal((await usageOf("1.1.1.1")).used, 0)
    assert.equal((await post({ code: code([{ text: "anon" }]) }, "1.1.1.1")).status, 201)
  })

  async function usageAs(cookie, ip = "1.1.1.1") {
    return (await submissionUsage(withCookie("/api/presets/usage", cookie, { ip }))).json()
  }

  async function voteAs(cookie, id, value, ip = "1.1.1.1") {
    const response = await votePreset(withCookie(`/api/presets/${id}/vote`, cookie, { method: "POST", body: { value }, ip, params: { id: String(id) } }))
    return { status: response.status, ...await response.json() }
  }

  test("signed in, what's yours comes from the account and ignores the IP", async () => {
    const cookie = await signIn()
    await share("from this ip", {}, "2.2.2.2")
    const { preset } = await shareAs(cookie, "on the account", {}, "3.3.3.3")
    const usage = await usageAs(cookie, "2.2.2.2")
    assert.equal(usage.used, 1)
    assert.deepEqual(usage.owned, [preset.id])
    assert.deepEqual(usage.shared, [preset.id])
  })

  test("the owner can't vote from any IP", async () => {
    const cookie = await signIn()
    const { preset } = await shareAs(cookie, "own vote")
    assert.equal((await voteAs(cookie, preset.id, 1, "9.9.9.9")).status, 403)
  })

  test("signed in, sharing from the same IP doesn't stop a vote", async () => {
    const cookie = await signIn()
    const anonymous = await share("from this ip", {}, "2.2.2.2")
    assert.equal((await voteAs(cookie, anonymous.id, 1, "2.2.2.2")).status, 200)
  })

  test("signed out, a vote isn't refused by where the preset was shared from", async () => {
    const preset = await share("without an account", {}, "2.2.2.2")
    assert.equal((await vote(preset.id, 1, "2.2.2.2")).status, 200)
  })

  describe("tokens", () => {
    function withToken(path, token, options) {
      const made = context(path, options)
      made.request = new Request(made.request, { headers: { "CF-Connecting-IP": "9.9.9.9", ...(token && { "X-Preset-Token": token }) } })
      return made
    }

    async function shared(text = "managed") {
      const { preset, token, onAccount } = await post({ code: code([{ text }]) }, "1.1.1.1")
      return { preset, token, onAccount }
    }

    async function renameWith(token, id, name = "renamed") {
      const response = await renamePreset(withToken(`/api/presets/${id}`, token, { method: "PATCH", body: { name }, params: { id: String(id) } }))
      return { status: response.status, ...await response.json() }
    }

    async function removeWith(token, id) {
      return (await deletePreset(withToken(`/api/presets/${id}`, token, { method: "DELETE", params: { id: String(id) } }))).status
    }

    async function claim(cookie, tokens) {
      const response = await claimPresets(withCookie("/api/presets/claim", cookie, { method: "POST", body: { tokens } }))
      return { status: response.status, ...await response.json() }
    }

    test("sharing without an account returns a token and stores only its hash", async () => {
      const { token, onAccount, preset } = await shared()
      assert.match(token, /^[0-9a-f]{64}$/)
      assert.equal(onAccount, false)
      const { token_hash: stored } = db.prepare("SELECT token_hash FROM presets WHERE id = ?").get(preset.id)
      assert.match(stored, /^[0-9a-f]{64}$/)
      assert.notEqual(stored, token)
    })

    test("the hash never reaches the public routes", async () => {
      const { preset } = await shared()
      assert.equal(JSON.stringify(await list()).includes("token"), false)
      const single = await getPreset(context(`/api/presets/${preset.id}`, { params: { id: String(preset.id) } }))
      assert.equal((await single.text()).includes("token"), false)
    })

    test("sharing on an account makes no token", async () => {
      const { token, preset } = await shareAs(await signIn(), "on account")
      assert.equal(token, undefined)
      assert.equal(db.prepare("SELECT token_hash FROM presets WHERE id = ?").get(preset.id).token_hash, null)
    })

    test("the token can rename and delete from any IP", async () => {
      const { token, preset } = await shared()
      assert.equal((await renameWith(token, preset.id)).preset.name, "renamed")
      assert.equal(await removeWith(token, preset.id), 200)
      assert.equal(db.prepare("SELECT COUNT(*) AS total FROM presets").get().total, 0)
    })

    test("no token or the wrong token can't change it, even from the same IP", async () => {
      const { preset } = await shared()
      const other = await shared("other")
      assert.equal((await renameWith(null, preset.id)).status, 401)
      assert.equal((await renameWith("wrong", preset.id)).status, 403)
      assert.equal((await renameWith(other.token, preset.id)).status, 403)
      assert.equal(await removeWith(other.token, preset.id), 403)
    })

    test("a token can't change a preset with no token", async () => {
      const { preset } = await shareAs(await signIn(), "on account")
      const { token } = await shared()
      assert.equal((await renameWith(token, preset.id)).status, 403)
      db.prepare("UPDATE presets SET token_hash = NULL, user_id = NULL").run()
      assert.equal((await renameWith(token, preset.id)).status, 403)
    })

    test("deleting with a token doesn't need or touch a user", async () => {
      const cookie = await signIn()
      await shareAs(cookie, "stays")
      const { token, preset } = await shared()
      await removeWith(token, preset.id)
      assert.equal(db.prepare("SELECT COUNT(*) AS total FROM users").get().total, 1)
    })

    test("signing in moves token presets to the account and kills the token", async () => {
      const cookie = await signIn()
      const { token, preset } = await shared()
      const { moved } = await claim(cookie, [{ id: preset.id, token }])
      assert.deepEqual(moved, [preset.id])
      const row = db.prepare("SELECT token_hash, user_id FROM presets").get()
      assert.equal(row.token_hash, null)
      assert.equal(db.prepare("SELECT name FROM users WHERE id = ?").get(row.user_id).name, "someone")
      assert.equal((await renameWith(token, preset.id)).status, 403)
      assert.deepEqual((await usageAs(cookie)).owned, [preset.id])
      assert.equal((await rename(cookie, preset.id, "mine")).preset.author, "someone")
    })

    test("a wrong token or a taken preset doesn't move, and leaves no user", async () => {
      const cookie = await signIn()
      const { preset } = await shared()
      assert.deepEqual((await claim(cookie, [{ id: preset.id, token: "wrong" }, { id: 999, token: "none" }])).moved, [])
      assert.equal(db.prepare("SELECT COUNT(*) AS total FROM users").get().total, 0)
      assert.notEqual(db.prepare("SELECT token_hash FROM presets").get().token_hash, null)
    })

    test("moving needs a session, a tidy request and an allowed username", async () => {
      const { token, preset } = await shared()
      const tokens = [{ id: preset.id, token }]
      assert.equal((await claim("session=none", tokens)).status, 401)
      const cookie = await signIn()
      assert.equal((await claim(cookie, "nope")).status, 400)
      assert.equal((await claim(cookie, [{ id: "1", token }])).status, 400)
      assert.equal((await claim(cookie, Array.from({ length: LIMITS.claimBatch + 1 }, () => tokens[0]))).status, 400)
      assert.equal((await claim(await signIn("discord", { id: "9", username: "fuck" }), tokens)).status, 400)
      assert.notEqual(db.prepare("SELECT token_hash FROM presets").get().token_hash, null)
    })
  })

  test("an account has one vote across IPs, and changing it doesn't add another", async () => {
    const cookie = await signIn()
    const preset = await share("voted on", {}, "2.2.2.2")
    await voteAs(cookie, preset.id, 1, "3.3.3.3")
    const { votes, vote: value } = await voteAs(cookie, preset.id, -1, "4.4.4.4")
    assert.equal(votes, 1)
    assert.equal(value, -1)
    assert.equal(db.prepare("SELECT COUNT(*) AS total FROM preset_votes").get().total, 1)
  })

  test("two accounts on one IP each get a vote", async () => {
    const first = await signIn("discord", { id: "1", username: "a" })
    const second = await signIn("discord", { id: "2", username: "b" })
    const preset = await share("voted on", {}, "2.2.2.2")
    await voteAs(first, preset.id, 1, "3.3.3.3")
    assert.equal((await voteAs(second, preset.id, 1, "3.3.3.3")).votes, 2)
  })

  test("account votes don't store the account or the IP", async () => {
    const cookie = await signIn()
    const preset = await share("voted on", {}, "2.2.2.2")
    await voteAs(cookie, preset.id, 1, "3.3.3.3")
    const { ip_hash: voter } = db.prepare("SELECT ip_hash FROM preset_votes").get()
    assert.match(voter, /^[0-9a-f]{64}$/)
    assert.equal((await usageOf("3.3.3.3")).votes[preset.id], undefined)
  })

  test("usage returns the votes of whoever is asking", async () => {
    const cookie = await signIn()
    const first = await share("one", {}, "2.2.2.2")
    const second = await share("two", {}, "2.2.2.2")
    await voteAs(cookie, first.id, 1, "3.3.3.3")
    await vote(second.id, -1, "3.3.3.3")
    assert.deepEqual((await usageAs(cookie, "3.3.3.3")).votes, { [first.id]: 1 })
    assert.deepEqual((await usageOf("3.3.3.3")).votes, { [second.id]: -1 })
  })

  test("the owner can rename, keeping the title", async () => {
    const cookie = await signIn()
    const { preset } = await shareAs(cookie, "before")
    const { status, preset: renamed } = await rename(cookie, preset.id, "  after  ")
    assert.equal(status, 200)
    assert.equal(renamed.name, "after")
    assert.equal(renamed.code, preset.code)
  })

  test("a rename is checked like a share", async () => {
    const cookie = await signIn()
    const { preset } = await shareAs(cookie, "before")
    assert.equal((await rename(cookie, preset.id, "   ")).status, 400)
    assert.equal((await rename(cookie, preset.id, "x".repeat(LIMITS.name + 1))).status, 400)
    assert.equal((await rename(cookie, preset.id, "fuck")).status, 400)
  })

  test("only the owner can rename or delete", async () => {
    const owner = await signIn("discord", { id: "1", username: "owner" })
    const other = await signIn("discord", { id: "2", username: "other" })
    const { preset } = await shareAs(owner, "theirs")
    assert.equal((await rename(other, preset.id, "stolen")).status, 403)
    assert.equal(await remove(other, preset.id), 403)
    assert.equal((await rename("session=none", preset.id, "stolen")).status, 401)
    assert.equal(await remove("session=none", preset.id), 401)
    assert.equal(db.prepare("SELECT name FROM presets").get().name, "Theirs")
  })

  test("nobody can change an anonymous preset, even from its IP", async () => {
    const cookie = await signIn()
    const preset = await share("anon", {}, "1.1.1.1")
    assert.equal((await rename(cookie, preset.id, "mine now")).status, 403)
    assert.equal(await remove(cookie, preset.id), 403)
  })

  test("a missing preset is a 404", async () => {
    const cookie = await signIn()
    assert.equal(await remove(cookie, 999), 404)
  })

  test("deleting removes its votes and downloads, and frees the title", async () => {
    const cookie = await signIn()
    const { preset } = await shareAs(cookie, "gone")
    await vote(preset.id, 1, "voter")
    await download(preset.id, "voter")
    assert.equal(await remove(cookie, preset.id), 200)
    for (const table of ["presets", "preset_votes", "preset_downloads", "preset_daily_downloads"]) assert.equal(db.prepare(`SELECT COUNT(*) AS total FROM ${table}`).get().total, 0, table)
    assert.equal((await shareAs(cookie, "gone")).status, 201)
  })

  test("deleting does not give the day's share back", async () => {
    const cookie = await signIn()
    const { preset } = await shareAs(cookie, "gone")
    await remove(cookie, preset.id)
    assert.equal((await (await submissionUsage(withCookie("/api/presets/usage", cookie))).json()).used, 1)
  })

  test("deleting the last preset leaves nothing identifying the account", async () => {
    const cookie = await signIn()
    const first = (await shareAs(cookie, "first")).preset
    const second = (await shareAs(cookie, "second")).preset
    await remove(cookie, first.id)
    assert.equal(db.prepare("SELECT COUNT(*) AS total FROM users").get().total, 1)
    await remove(cookie, second.id)
    assert.deepEqual(rowsEverywhere(), { account_submissions: 1, deleted_presets: 2 })
    const dump = JSON.stringify(db.prepare("SELECT * FROM account_submissions").all().concat(db.prepare("SELECT * FROM deleted_presets").all()))
    assert.doesNotMatch(dump, /1234|someone|discord/)
  })

  test("the daily count is forgotten after its day", async () => {
    const cookie = await signIn()
    const { preset } = await shareAs(cookie, "gone")
    db.prepare("UPDATE account_submissions SET day = '2000-01-01'").run()
    await remove(cookie, preset.id)
    assert.equal(db.prepare("SELECT COUNT(*) AS total FROM account_submissions").get().total, 0)
  })

  test("the id of a deleted newest preset is never reused", async () => {
    const cookie = await signIn()
    const first = (await shareAs(cookie, "first")).preset
    const second = (await shareAs(cookie, "second")).preset
    await remove(cookie, second.id)
    const third = (await shareAs(cookie, "third")).preset
    assert.equal(third.id, second.id + 1)
    await remove(cookie, third.id)
    await remove(cookie, first.id)
    assert.equal((await post({ code: code([{ text: "fourth" }]) })).preset.id, third.id + 1)
  })

  test("random still finds presets when the sampled ids were deleted", async () => {
    const cookie = await signIn()
    const ids = []
    for (let day = 0; day < 8; day++) {
      for (let index = 0; index < LIMITS.perDay; index++) ids.push((await shareAs(cookie, `title ${day} ${index}`)).preset.id)
      db.prepare("DELETE FROM account_submissions").run()
    }
    for (const id of ids.slice(0, -1)) await remove(cookie, id)
    let draw = 0
    const random = mock.method(Math, "random", () => draw++ % LIMITS.page / ids.length)
    try {
      const { presets } = await list("?sort=random")
      assert.deepEqual(presets.map(preset => preset.id), [ids.at(-1)])
    } finally {
      random.mock.restore()
    }
  })

  test("renaming clears the sorted pages and that preset from the edge cache", async () => {
    const cookie = await signIn()
    const { preset } = await shareAs(cookie, "cached")
    const deleted = []
    globalThis.caches = { default: { match: async () => undefined, put: async () => {}, delete: async request => deleted.push(request.url) } }
    try {
      await rename(cookie, preset.id, "renamed")
      assert.ok(deleted.includes(`https://example.test/api/presets/${preset.id}`))
      assert.ok(deleted.includes("https://example.test/api/presets?sort=new&offset=0"))
    } finally {
      delete globalThis.caches
    }
  })

  describe("saved presets", () => {
    function savedCall(handler, cookie, method, body) {
      return handler(withCookie("/api/saved", cookie, { method, body }))
    }

    async function savedList(cookie) {
      return (await (await savedCall(listSaved, cookie, "GET")).json()).presets
    }

    async function save(cookie, presets) {
      const response = await savedCall(addSaved, cookie, "POST", { presets })
      return { status: response.status, ...await response.json() }
    }

    function saved(text, name = text) {
      return { name, code: code([{ text }]) }
    }

    test("every route needs a session", async () => {
      assert.equal((await listSaved(context("/api/saved"))).status, 401)
      assert.equal((await save("session=none", [saved("a")])).status, 401)
      assert.equal((await savedCall(changeSaved, "session=none", "PATCH", { code: "a", name: "b" })).status, 401)
      assert.equal((await savedCall(removeSaved, "session=none", "DELETE", { code: "a" })).status, 401)
    })

    test("saves and lists in order, only for that account", async () => {
      const first = await signIn("discord", { id: "1", username: "a" })
      const second = await signIn("discord", { id: "2", username: "b" })
      await save(first, [saved("one"), saved("two")])
      await save(second, [saved("three")])
      assert.deepEqual((await savedList(first)).map(preset => preset.name), ["one", "two"])
      assert.deepEqual((await savedList(second)).map(preset => preset.name), ["three"])
    })

    test("the same title saved again keeps the first name, and two accounts can both save it", async () => {
      const first = await signIn("discord", { id: "1", username: "a" })
      const second = await signIn("discord", { id: "2", username: "b" })
      await save(first, [saved("same", "first name")])
      assert.deepEqual((await save(first, [saved("same", "second name")])).kept, [])
      await save(second, [saved("same", "theirs")])
      assert.deepEqual((await savedList(first)).map(preset => preset.name), ["first name"])
      assert.deepEqual((await savedList(second)).map(preset => preset.name), ["theirs"])
    })

    test("keeps the shared id, and leaves it out when there is none", async () => {
      const cookie = await signIn()
      await save(cookie, [{ ...saved("one"), shared: 5 }, saved("two")])
      const [one, two] = await savedList(cookie)
      assert.equal(one.shared, 5)
      assert.equal(Object.hasOwn(two, "shared"), false)
    })

    test("hands back anything damaged, too big or badly named", async () => {
      const cookie = await signIn()
      const big = { name: "big", code: `${"a".repeat(LIMITS.savedCode + 1)}` }
      const damaged = { name: "damaged", code: "!!!" }
      const unnamed = { ...saved("unnamed"), name: " " }
      const { kept } = await save(cookie, [big, damaged, unnamed, saved("fine")])
      assert.deepEqual(kept, [big.code, damaged.code, unnamed.code])
      assert.deepEqual((await savedList(cookie)).map(preset => preset.name), ["fine"])
    })

    test("a batch over the limit is refused", async () => {
      const cookie = await signIn()
      const presets = Array.from({ length: LIMITS.savedBatch + 1 }, (_, index) => saved(`title ${index}`))
      assert.equal((await save(cookie, presets)).status, 400)
    })

    test("hands back what goes over the account's limit, but still accepts titles it already has", async () => {
      const cookie = await signIn()
      for (let index = 0; index < LIMITS.savedPresets; index += LIMITS.savedBatch) await save(cookie, Array.from({ length: LIMITS.savedBatch }, (_, offset) => saved(`title ${index + offset}`)))
      const extra = saved("extra")
      const { kept } = await save(cookie, [saved("title 0"), extra])
      assert.deepEqual(kept, [extra.code])
      assert.equal((await savedList(cookie)).length, LIMITS.savedPresets)
    })

    test("renames and marks shared, only on that account", async () => {
      const cookie = await signIn("discord", { id: "1", username: "a" })
      const other = await signIn("discord", { id: "2", username: "b" })
      const preset = saved("one")
      await save(cookie, [preset])
      await savedCall(changeSaved, other, "PATCH", { code: preset.code, name: "stolen" })
      await savedCall(changeSaved, cookie, "PATCH", { code: preset.code, name: " new name " })
      await savedCall(changeSaved, cookie, "PATCH", { code: preset.code, shared: 9 })
      assert.deepEqual(await savedList(cookie), [{ name: "new name", code: preset.code, shared: 9 }])
      await savedCall(changeSaved, cookie, "PATCH", { code: preset.code, shared: null })
      assert.deepEqual(await savedList(cookie), [{ name: "new name", code: preset.code }])
    })

    test("a change is checked", async () => {
      const cookie = await signIn()
      const preset = saved("one")
      await save(cookie, [preset])
      assert.equal((await savedCall(changeSaved, cookie, "PATCH", { code: preset.code, name: " " })).status, 400)
      assert.equal((await savedCall(changeSaved, cookie, "PATCH", { code: preset.code })).status, 400)
      assert.equal((await savedCall(changeSaved, cookie, "PATCH", { name: "no code" })).status, 400)
    })

    test("deletes only from that account, and leaves nothing behind", async () => {
      const cookie = await signIn("discord", { id: "1", username: "a" })
      const other = await signIn("discord", { id: "2", username: "b" })
      const preset = saved("one")
      await save(cookie, [preset])
      await savedCall(removeSaved, other, "DELETE", { code: preset.code })
      assert.equal((await savedList(cookie)).length, 1)
      await savedCall(removeSaved, cookie, "DELETE", { code: preset.code })
      assert.deepEqual(rowsEverywhere(), {})
    })

  })
})
