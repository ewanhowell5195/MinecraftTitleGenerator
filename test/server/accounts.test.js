import { afterEach, beforeEach, describe, mock, test } from "node:test"
import assert from "node:assert/strict"
import { atProvider, begin, calls, code, context, cookiePair, db, download, env, finishing, freshServer, list, post, remove, rename, restoreFetch, rowsEverywhere, share, shareAs, signIn, stubProvider, usageAs, usageOf, vote, withCookie } from "../helpers/presets.js"

const { LIMITS } = await import("#lib/core/limits.js")
const { getPreset, submissionUsage } = await import("#server/presets.js")
const { votePreset } = await import("#server/presetScores.js")
const { accountDetails, signOut, startSignIn } = await import("#server/accounts.js")
const { addSaved, removeSaved } = await import("#server/saved.js")

beforeEach(freshServer)

describe("accounts", () => {
  const realNow = Date.now.bind(Date)

  afterEach(restoreFetch)

  test("starting a sign-in redirects with the one registered callback and keeps a secure nonce cookie", async () => {
    const { response } = await begin()
    assert.equal(response.status, 302)
    const target = new URL(response.headers.get("Location"))
    assert.equal(target.origin + target.pathname, "https://discord.com/oauth2/authorize")
    assert.equal(target.searchParams.get("client_id"), "discord-id")
    assert.equal(target.searchParams.get("scope"), "identify email")
    assert.equal(target.searchParams.get("redirect_uri"), "https://mctitlegenerator.com/api/account/login/discord/callback")
    assert.match(response.headers.get("Set-Cookie"), /^signin_state=[0-9a-f]{64};.*HttpOnly; Secure; SameSite=Lax/)
  })

  for (const origin of ["https://mctitlegenerator.com", "https://dev.ewanhowell.com", "http://localhost:9123", "http://127.0.0.1:9123"]) {
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

  test("a sign-in can't be finished as another provider", async () => {
    stubProvider({ id: "1", username: "a" })
    const { state, cookie } = await begin()
    const back = await atProvider("discord", { code: "abc", state })
    const finished = await finishing(back.headers.get("Location"), cookie, "github")
    assert.equal(finished.status, 400)
  })

  for (const origin of ["https://evil.test", "https://mctitlegenerator.com.evil.test", "https://minecrafttitlegenerator.pages.dev", "https://abc123.minecrafttitlegenerator.pages.dev", "https://evilminecrafttitlegenerator.pages.dev", "http://minecrafttitlegenerator.pages.dev", "http://dev.ewanhowell.com", "javascript:alert(1)"]) {
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
    assert.deepEqual(await who(cookie), { id: "github:42", name: "octo", provider: "github", avatar: "https://avatars.githubusercontent.com/u/42?s=64", unread: 0, notifications: 0, submissions: 0, waiting: 0, issues: 0, admin: false })
  })

  test("discord uses the username, not the display name", async () => {
    assert.equal((await who(await signIn())).name, "someone")
  })

  test("discord profile pictures fall back to the default one for the id", async () => {
    assert.equal((await who(await signIn("discord", { id: "80351110224678912", username: "a", avatar: "a_1f2e" }))).avatar, "https://cdn.discordapp.com/avatars/80351110224678912/a_1f2e.png?size=64")
    assert.equal((await who(await signIn("discord", { id: "80351110224678912", username: "a", avatar: null }))).avatar, "https://cdn.discordapp.com/embed/avatars/5.png")
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

  describe("searching by user", () => {
    async function people() {
      const first = await signIn("discord", { id: "1", username: "first_person" })
      const second = await signIn("github", { id: 2, login: "SecondPerson" })
      await shareAs(first, "nether one")
      await shareAs(first, "grass one")
      await shareAs(second, "nether two")
      await post({ code: code([{ text: "nether three" }]) })
    }

    async function names(query) {
      return (await list(query)).presets.map(preset => preset.name).toSorted()
    }

    test("finds only that user's presets in every sort", async () => {
      await people()
      for (const sort of ["week", "popular", "top", "new", "needs", "random"]) assert.deepEqual(await names(`?sort=${sort}&q=user:first_person`), ["Grass One", "Nether One"], sort)
    })

    test("the same name on both providers: no prefix finds both, a prefix finds one", async () => {
      const onDiscord = await signIn("discord", { id: "1", username: "shared_name" })
      const onGithub = await signIn("github", { id: 2, login: "shared_name" })
      await shareAs(onDiscord, "discord title")
      await shareAs(onGithub, "github title")
      assert.deepEqual(await names("?sort=new&q=user:shared_name"), ["Discord Title", "Github Title"])
      assert.deepEqual(await names("?sort=new&q=user:d:shared_name"), ["Discord Title"])
      assert.deepEqual(await names("?sort=new&q=user:g:shared_name"), ["Github Title"])
      assert.deepEqual(await names("?sort=random&q=user:g:shared_name"), ["Github Title"])
      assert.deepEqual(await names("?sort=new&q=title%20user:d:shared_name"), ["Discord Title"])
    })

    test("is not case sensitive", async () => {
      await people()
      assert.deepEqual(await names("?sort=new&q=USER:secondperson"), ["Nether Two"])
    })

    test("combines with text, in any order", async () => {
      await people()
      assert.deepEqual(await names("?sort=new&q=nether%20user:first_person"), ["Nether One"])
      assert.deepEqual(await names("?sort=new&q=user:first_person%20nether"), ["Nether One"])
      assert.deepEqual(await names("?sort=random&q=nether%20user:first_person"), ["Nether One"])
    })

    test("finds nothing for an unknown user", async () => {
      await people()
      assert.deepEqual(await names("?sort=new&q=user:nobody"), [])
    })

    test("a user on its own searches", async () => {
      assert.equal((await list("?sort=new&q=user:a")).status, 200)
    })

    test("can't reach into the query", async () => {
      await people()
      assert.deepEqual(await names(`?sort=new&q=${encodeURIComponent("user:x'OR'1'='1")}`), [])
    })
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

  test("saving keeps back titles that use something the site hasn't published", async () => {
    const cookie = await signIn()
    const unknown = { name: "unknown", code: code([{ text: "a", font: "preview-only" }]) }
    const response = await addSaved(withCookie("/api/saved", cookie, { method: "POST", body: { presets: [unknown, { name: "known", code: code([{ text: "b" }]) }] } }))
    assert.deepEqual((await response.json()).kept, [unknown.code])
    assert.deepEqual(db.prepare("SELECT name FROM presets").all().map(row => row.name), ["known"])
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
    assert.deepEqual(changed.map(sql => sql.split(" ")[1]), ["users", "connections"])
    assert.deepEqual((await list("?sort=new")).presets.map(preset => preset.author), ["new", "new"])
  })

  test("sharing with a session from before a username change keeps the row up to date", async () => {
    const first = await signIn("discord", { id: "1", username: "first" })
    await shareAs(first, "one")
    const second = await signIn("discord", { id: "1", username: "second" })
    await shareAs(second, "two")
    assert.deepEqual(db.prepare("SELECT name FROM users").all().map(row => row.name), ["second"])
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
    assert.match((await rename(cookie, preset.id, " H ")).error, /at least 3 characters/)
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
})
