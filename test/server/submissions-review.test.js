import { afterEach, beforeEach, describe, test } from "node:test"
import assert from "node:assert/strict"
import { context, details, hook, signIn } from "../helpers/server.js"
import { closed, db, edit, emails, gh, holdGitHub, resend, restore, revisionOf, send, textureServer, waiting } from "../helpers/submissionServer.js"

const { accountDetails } = await import("../../src/server/accounts.js")
const { listSubmissions, submissionDetails, withdrawSubmission } = await import("../../src/server/submissions/index.js")
const { addComment } = await import("../../src/server/submissions/comments.js")
const { clearNotifications, listNotifications, markNotificationsSeen } = await import("../../src/server/submissions/notifications.js")
const { reviewState, reviewSubmission } = await import("../../src/server/submissions/review.js")

beforeEach(textureServer)

afterEach(() => restore())

describe("reviewing on the site", () => {
  async function admin() {
    db.prepare("INSERT INTO users (provider, provider_id, name, created_at, admin) VALUES ('github', '77', 'ewan', 0, 1)").run()
    return signIn("github", { id: 77, login: "ewan" })
  }

  async function news(cookie) {
    return (await (await listNotifications(context("/api/notifications", { cookie }))).json()).notifications.map(item => [item.kind, item.author, item.body])
  }

  async function comment(cookie, id, body) {
    const response = await addComment(context(`/api/submissions/${id}/comments`, { method: "POST", body: JSON.stringify({ body }), cookie, params: { id: String(id) } }))
    return { status: response.status, ...await response.json() }
  }

  async function review(cookie, id, action, text, revision = revisionOf(id)) {
    const response = await reviewSubmission(context(`/api/submissions/${id}/review`, { method: "POST", body: JSON.stringify({ action, comment: text, revision }), cookie, params: { id: String(id) } }))
    return { status: response.status, ...await response.json() }
  }

  async function thread(id, cookie) {
    return (await (await submissionDetails(context(`/api/submissions/${id}`, { cookie, params: { id: String(id) } }))).json())
  }

  function githubComment(login, id, association = "OWNER") {
    return { action: "created", issue: { number: 1, pull_request: {} }, comment: { body: `from ${login}`, author_association: association, html_url: "https://github.com/c", user: { login, id, type: "User" } } }
  }

  test("admins are told about new and changed submissions, and stay admins without presets", async () => {
    const reviewer = await admin()
    const cookie = await signIn()
    const { id } = await send(cookie)
    await edit(cookie, id, { name: "Shiny Gold" })
    await edit(cookie, id, { name: "Shinier Gold" })
    assert.deepEqual(await news(reviewer), [["edited", "someone", ""], ["submitted", "someone", ""]])
    await markNotificationsSeen(context("/api/notifications", { method: "POST", cookie: reviewer }))
    await edit(cookie, id, { name: "Shiniest Gold" })
    assert.deepEqual(await news(reviewer), [["edited", "someone", ""], ["edited", "someone", ""], ["submitted", "someone", ""]])
    assert.deepEqual(await news(cookie), [])
    const events = (await thread(id)).comments.filter(item => item.kind === "edit")
    assert.deepEqual(events.map(item => [item.author, item.role]), [["someone", "submitter"]])
    assert.deepEqual(gh.comments.map(item => item.body), ["` someone ` (submitter) changed the submission on the site."])
    assert.equal((await (await accountDetails(context("/api/account", { cookie: reviewer }))).json()).user.admin, true)
    assert.equal((await (await accountDetails(context("/api/account", { cookie: reviewer }))).json()).user.waiting, 1)
    assert.equal((await (await accountDetails(context("/api/account", { cookie }))).json()).user.waiting, 0)
    assert.equal((await thread(id, reviewer)).reviewer, true)
    assert.equal((await thread(id, cookie)).reviewer, false)
  })

  test("admins can change someone's submission but not its notes, which tells the submitter on the site without an email", async () => {
    const reviewer = await admin()
    const cookie = await signIn()
    const { id } = await send(cookie, { notes: "made with love" })
    await Promise.all(waiting)
    emails.splice(0)
    const { status, submission } = await edit(reviewer, id, { name: "Shiny Gold", notes: "" })
    assert.equal(status, 200)
    assert.deepEqual([submission.name, submission.mine, submission.notes], ["Shiny Gold", false, "made with love"])
    assert.match(gh.pulls.get(1).body, /made with love/)
    assert.equal(gh.pulls.get(1).title, "Shiny Gold texture for Minecraft Ten")
    assert.match(gh.pulls.get(1).body, /Sent from the website by ` someone ` \(discord\)/)
    await edit(reviewer, id, { name: "Shinier Gold" })
    await Promise.all(waiting)
    assert.deepEqual(emails, [])
    assert.deepEqual(await news(cookie), [["edited", "ewan", ""]])
    assert.deepEqual(await news(reviewer), [["submitted", "someone", ""]])
    assert.deepEqual(gh.comments.map(item => item.body), ["` ewan ` (reviewer) changed the submission on the site."])
    await edit(cookie, id, { name: "Gold" })
    await Promise.all(waiting)
    assert.deepEqual(emails.map(email => [email.to, email.subject]), [["ewan@example.com", "someone changed Gold"]])
    assert.deepEqual(await news(cookie), [["edited", "ewan", ""]])
    assert.deepEqual(await news(reviewer), [["edited", "someone", ""], ["submitted", "someone", ""]])
    assert.deepEqual((await thread(id)).comments.map(item => [item.kind, item.author, item.role]), [["edit", "ewan", "reviewer"], ["edit", "someone", "submitter"]])
  })

  test("admins can't withdraw someone's submission, and two admins' changes are each noted", async () => {
    const reviewer = await admin()
    db.prepare("INSERT INTO users (provider, provider_id, name, created_at, admin) VALUES ('github', '78', 'second', 0, 1)").run()
    const second = await signIn("github", { id: 78, login: "second" })
    const cookie = await signIn()
    const { id } = await send(cookie)
    assert.equal((await withdrawSubmission(context(`/api/submissions/${id}`, { method: "DELETE", cookie: reviewer, params: { id: String(id) } }))).status, 404)
    await edit(reviewer, id, { name: "Shiny Gold" })
    await edit(second, id, { name: "Shinier Gold" })
    assert.deepEqual(await news(cookie), [["edited", "second", ""]])
    assert.deepEqual((await news(reviewer)).concat(await news(second)).filter(([kind]) => kind === "edited"), [])
    assert.deepEqual((await thread(id)).comments.map(item => [item.kind, item.author]), [["edit", "ewan"], ["edit", "second"]])
  })

  test("the submitter and admins comment on the site, and each is told about the other's comments", async () => {
    const reviewer = await admin()
    const cookie = await signIn()
    const { id } = await send(cookie)
    assert.equal((await comment(cookie, id, "  is this @everyone ok?  ")).status, 201)
    assert.equal(gh.comments.at(-1).body, "` someone ` (submitter) commented on the site:\n\n```text\nis this @everyone ok?\n```")
    assert.equal((await comment(reviewer, id, "Looks good")).status, 201)
    assert.match(gh.comments.at(-1).body, /^` ewan ` \(reviewer\) commented on the site:/)
    assert.deepEqual((await news(reviewer)).slice(0, 1), [["comment", "someone", "is this @everyone ok?"]])
    assert.deepEqual(await news(cookie), [["comment", "ewan", "Looks good"]])
    const { comments } = await thread(id)
    assert.deepEqual(comments.map(item => [item.author, item.role, item.body]), [["someone", "submitter", "is this @everyone ok?"], ["ewan", "reviewer", "Looks good"]])
    const stranger = await signIn("github", { id: 9, login: "other" })
    assert.equal((await comment(stranger, id, "me too")).status, 403)
    assert.equal((await comment(null, id, "me too")).status, 401)
    assert.equal((await comment(cookie, id, "   ")).status, 400)
    assert.equal((await comment(cookie, id, "x".repeat(2001))).status, 400)
  })

  test("the submitter can only send so many comments a day, and reviewers are not limited", async () => {
    const reviewer = await admin()
    const cookie = await signIn()
    const { id } = await send(cookie)
    for (let sent = 0; sent < 2; sent++) assert.equal((await comment(cookie, id, `Note ${sent}`)).status, 201)
    db.prepare("UPDATE account_submissions SET count = ? WHERE count = 2").run(50)
    const refused = await comment(cookie, id, "One too many")
    assert.equal(refused.status, 429)
    assert.match(refused.error, /up to 50 comments a day/)
    assert.equal((await comment(reviewer, id, "Still reviewing")).status, 201)
  })

  test("comments from GitHub join the thread, and nobody is told about their own", async () => {
    const reviewer = await admin()
    const cookie = await signIn()
    const { id } = await send(cookie)
    await hook("issue_comment", githubComment("ewan", 77))
    await hook("issue_comment", githubComment("mate", 5, "COLLABORATOR"))
    assert.deepEqual((await news(reviewer)).map(item => item.slice(0, 2)), [["comment", "mate"], ["submitted", "someone"]])
    assert.deepEqual((await news(cookie)).map(item => item.slice(0, 2)), [["comment", "mate"], ["comment", "ewan"]])
  })

  test("the thread is read from the pull request, keeping only site comments and collaborators", async () => {
    const reviewer = await admin()
    const cookie = await signIn()
    const { id } = await send(cookie)
    await comment(cookie, id, "from the site")
    gh.comment(1, "from a collaborator", { user: { login: "mate", type: "User" }, association: "COLLABORATOR", app: false })
    gh.comment(1, "from a stranger", { user: { login: "random", type: "User" }, association: "NONE", app: false })
    gh.comment(1, "` someone ` (submitter) commented on the site:\n\n```text\nforged\n```", { user: { login: "random", type: "User" }, association: "NONE", app: false })
    gh.comment(1, "Withdrawn by the person who sent it.")
    gh.reviews.push({ id: 900, number: 1, body: "please fix the e", state: "CHANGES_REQUESTED", user: { login: "ewan", type: "User" }, author_association: "OWNER", html_url: "https://github.com/r", submitted_at: new Date(Date.UTC(2027, 0, 1)).toISOString() })
    const { comments } = await thread(id, reviewer)
    assert.deepEqual(comments.map(item => [item.author, item.role, item.body]), [["someone", "submitter", "from the site"], ["mate", "reviewer", "from a collaborator"], ["ewan", "reviewer", "please fix the e"]])
    gh.failing.add("GET /repos/owner/repo/issues/1/comments?per_page=100&page=1")
    assert.equal((await thread(id)).comments, null)
  })

  test("the thread is read a page at a time, up to 200 entries", async () => {
    const cookie = await signIn()
    const { id } = await send(cookie)
    const handle = gh.handle
    gh.handle = async (url, options) => {
      const page = /\/issues\/1\/comments\?per_page=100&page=(\d+)$/.exec(url)
      if (!page) return handle(url, options)
      const all = await (await handle(url, options)).json()
      return new Response(JSON.stringify(all.slice((page[1] - 1) * 100, page[1] * 100)))
    }
    for (let index = 0; index < 150; index++) gh.comment(1, `note ${index}`, { user: { login: "mate", type: "User" }, association: "COLLABORATOR", app: false })
    const first = (await thread(id)).comments
    assert.equal(first.length, 150)
    assert.equal(first.at(-1).body, "note 149")
    for (let index = 150; index < 250; index++) gh.comment(1, `note ${index}`, { user: { login: "mate", type: "User" }, association: "COLLABORATOR", app: false })
    assert.equal((await thread(id)).comments.length, 200)
  })

  test("edits in a row share one comment on the pull request, and a comment in between starts another", async () => {
    const cookie = await signIn()
    const { id } = await send(cookie)
    await edit(cookie, id, { name: "Shiny Gold" })
    await edit(cookie, id, { name: "Shinier Gold" })
    await comment(cookie, id, "ready now")
    await edit(cookie, id, { name: "Shiniest Gold" })
    await edit(cookie, id, { name: "Gold" })
    assert.deepEqual((await thread(id)).comments.map(item => item.kind), ["edit", "comment", "edit"])
    assert.equal(gh.comments.length, 3)
  })

  test("admins can merge from the site once GitHub is ready, which publishes it and clears its notifications", async () => {
    const reviewer = await admin()
    const cookie = await signIn()
    const { id } = await send(cookie)
    await comment(cookie, id, "ready?")
    await comment(reviewer, id, "nearly")
    assert.equal((await review(cookie, id, "merge")).status, 403)
    assert.equal((await (await reviewState(context(`/api/submissions/${id}/review`, { cookie: reviewer, params: { id: String(id) } }))).json()).state, "clean")
    gh.pulls.get(1).mergeable_state = "unstable"
    const seen = (await details(id, reviewer)).updatedAt
    const early = await review(reviewer, id, "merge", undefined, seen)
    assert.equal(early.status, 409)
    assert.match(early.error, /Wait for its checks to finish/)
    assert.equal((await details(id)).status, "open")
    gh.pulls.get(1).mergeable_state = "clean"
    const merged = await review(reviewer, id, "merge", undefined, seen)
    assert.equal(merged.status, 200)
    assert.equal(merged.outcome, "published")
    assert.equal(await details(id), undefined)
    assert.equal(gh.pulls.get(1).merged, true)
    assert.equal(gh.pulls.get(1).merge_method, "squash")
    assert.equal(gh.pulls.get(1).commit_message, "")
    assert.equal(gh.refs.has(`heads/submission/${id}`), false)
    assert.deepEqual(await news(reviewer), [])
    assert.deepEqual(await news(cookie), [["published", "ewan", ""]])
    await hook("pull_request", closed(1, true, id))
    assert.deepEqual(await news(cookie), [["published", "ewan", ""]])
    assert.equal((await review(reviewer, id, "decline")).status, 404)
  })

  test("a merge on GitHub clears the notifications too", async () => {
    const reviewer = await admin()
    const cookie = await signIn()
    const { id } = await send(cookie)
    await comment(cookie, id, "ready?")
    await hook("pull_request", closed(1, true, id))
    assert.deepEqual(await news(reviewer), [])
    assert.deepEqual(await news(cookie), [["published", "ewan", ""]])
  })

  test("admins can decline from the site with a comment the submitter is told", async () => {
    const reviewer = await admin()
    const cookie = await signIn()
    const { id } = await send(cookie)
    const declined = await review(reviewer, id, "decline", "Too close to an existing one")
    assert.equal(declined.status, 200)
    assert.equal(declined.outcome, "rejected")
    assert.equal(await details(id), undefined)
    assert.equal(gh.pulls.get(1).state, "closed")
    assert.equal(gh.pulls.get(1).merged, undefined)
    assert.match(gh.comments.at(-1).body, /Too close to an existing one/)
    assert.deepEqual(await news(cookie), [["rejected", "ewan", "Too close to an existing one"]])
    assert.deepEqual(await news(reviewer), [])
  })

  function hookDuring(route, payload) {
    const handle = gh.handle
    gh.handle = async (url, options) => {
      const response = await handle(url, options)
      if (`${options?.method ?? "GET"} ${url}`.endsWith(route)) await hook("pull_request", payload)
      return response
    }
  }

  test("a decline on the site keeps its reason when GitHub's webhook gets there first", async () => {
    const reviewer = await admin()
    const cookie = await signIn()
    const { id } = await send(cookie)
    hookDuring("PATCH https://github.test/repos/owner/repo/pulls/1", closed(1, false, id))
    assert.equal((await review(reviewer, id, "decline", "Too close to an existing one")).status, 200)
    assert.deepEqual(await news(cookie), [["rejected", "ewan", "Too close to an existing one"]])
    assert.equal(await details(id), undefined)
  })

  test("a merge on the site tells the submitter once when GitHub's webhook gets there first", async () => {
    const reviewer = await admin()
    const cookie = await signIn()
    const { id } = await send(cookie)
    hookDuring("PUT https://github.test/repos/owner/repo/pulls/1/merge", closed(1, true, id))
    assert.equal((await review(reviewer, id, "merge")).outcome, "published")
    assert.deepEqual(await news(cookie), [["published", "ewan", ""]])
    assert.equal(gh.refs.has(`heads/submission/${id}`), false)
  })

  test("a review GitHub refuses leaves the submission open to review again", async () => {
    const reviewer = await admin()
    const cookie = await signIn()
    const { id } = await send(cookie)
    gh.failing.add("PATCH /repos/owner/repo/pulls/:n")
    assert.equal((await review(reviewer, id, "decline")).status, 502)
    assert.equal((await details(id)).status, "open")
    assert.deepEqual(await news(cookie), [])
    gh.failing.clear()
    assert.equal((await review(reviewer, id, "decline")).status, 200)
  })

  test("a merge of a version the reviewer didn't see is refused", async () => {
    const reviewer = await admin()
    const cookie = await signIn()
    const { id } = await send(cookie)
    const seen = (await details(id, reviewer)).updatedAt
    assert.equal((await edit(cookie, id, { name: "Shiny Gold" })).status, 200)
    const merged = await review(reviewer, id, "merge", undefined, seen)
    assert.equal(merged.status, 409)
    assert.match(merged.error, /changed after you opened it/)
    assert.equal(gh.pulls.get(1).state, "open")
    assert.equal((await details(id)).status, "open")
    assert.equal((await review(reviewer, id, "merge")).status, 200)
  })

  test("a merge while an edit is being pushed is refused", async () => {
    const reviewer = await admin()
    const cookie = await signIn()
    const { id } = await send(cookie)
    const hold = holdGitHub((method, url) => method === "POST" && url.endsWith("/git/commits"))
    const editing = edit(cookie, id, { name: "Shiny Gold" })
    await hold.arrived
    const seen = (await details(id, reviewer)).updatedAt
    const merged = await review(reviewer, id, "merge", undefined, seen)
    assert.equal(merged.status, 409)
    assert.match(merged.error, /changed after you opened it/)
    hold.release()
    assert.equal((await editing).status, 200)
    assert.equal(gh.pulls.get(1).state, "open")
    assert.equal((await review(reviewer, id, "merge", undefined, seen)).status, 409)
    assert.equal((await review(reviewer, id, "merge")).status, 200)
    assert.equal(gh.pulls.get(1).title, "Shiny Gold texture for Minecraft Ten")
  })

  test("a review has to say which version it was made on", async () => {
    const reviewer = await admin()
    const cookie = await signIn()
    const { id } = await send(cookie)
    assert.equal((await review(reviewer, id, "decline", "No", null)).status, 400)
    assert.equal(gh.pulls.get(1).state, "open")
  })

  test("two reviews at once only close it once", async () => {
    const reviewer = await admin()
    const cookie = await signIn()
    const { id } = await send(cookie)
    const outcomes = await Promise.all([review(reviewer, id, "decline", "No"), review(reviewer, id, "decline", "No")])
    assert.equal(outcomes.filter(item => item.status === 200).length, 1)
    assert.deepEqual(await news(cookie), [["rejected", "ewan", "No"]])
    assert.equal(gh.comments.length, 1)
  })

  test("clearing deletes only your own notifications", async () => {
    const reviewer = await admin()
    const cookie = await signIn()
    const { id } = await send(cookie)
    await comment(reviewer, id, "Looks good")
    const counts = async who => (await (await accountDetails(context("/api/account", { cookie: who }))).json()).user
    assert.equal((await counts(cookie)).notifications, 1)
    assert.equal((await counts(reviewer)).notifications, 1)
    assert.equal((await clearNotifications(context("/api/notifications", { method: "DELETE", cookie }))).status, 200)
    assert.deepEqual(await news(cookie), [])
    assert.equal((await counts(cookie)).notifications, 0)
    assert.equal((await counts(reviewer)).notifications, 1)
  })

  test("opening one submission only marks its own notifications as seen", async () => {
    const reviewer = await admin()
    const cookie = await signIn()
    const first = await send(cookie)
    const second = await send(cookie, { name: "Silver Bricks" })
    await comment(reviewer, first.id, "One")
    await comment(reviewer, second.id, "Two")
    await markNotificationsSeen(context(`/api/notifications?submission=${first.id}`, { method: "POST", cookie }))
    const { notifications } = await (await listNotifications(context("/api/notifications", { cookie }))).json()
    assert.deepEqual(notifications.map(item => [item.body, item.seen]), [["Two", false], ["One", true]])
  })

  test("only admins see every open submission", async () => {
    const reviewer = await admin()
    const cookie = await signIn()
    await send(cookie)
    await send(await signIn("github", { id: 9, login: "other" }), { name: "Iron Bricks" })
    const listed = async who => listSubmissions(context("/api/submissions?review", { cookie: who }))
    assert.equal((await listed(cookie)).status, 403)
    assert.deepEqual((await (await listed(reviewer)).json()).submissions.map(item => item.name), ["Gold Bricks", "Iron Bricks"])
  })
})

describe("emailing notifications", () => {
  async function admin() {
    db.prepare("INSERT INTO users (provider, provider_id, name, created_at, admin) VALUES ('github', '77', 'ewan', 0, 1)").run()
    return signIn("github", { id: 77, login: "ewan" })
  }

  async function comment(cookie, id, body) {
    await addComment(context(`/api/submissions/${id}/comments`, { method: "POST", body: JSON.stringify({ body }), cookie, params: { id: String(id) } }))
    await Promise.all(waiting)
  }

  function stored() {
    return db.prepare("SELECT name, email FROM users ORDER BY id").all().map(row => [row.name, row.email])
  }

  function inbox() {
    return emails.splice(0).map(email => [email.to, email.subject])
  }

  test("only keeps the email of people with submissions and reviewers", async () => {
    await admin()
    const cookie = await signIn()
    db.prepare("INSERT INTO users (provider, provider_id, name, created_at) VALUES ('discord', '5', 'presets', 0)").run()
    await signIn("discord", { id: "5", username: "presets", email: "presets@example.com", verified: true })
    assert.deepEqual(stored(), [["ewan", "ewan@example.com"], ["presets", null]])
    const { id } = await send(cookie)
    await Promise.all(waiting)
    assert.deepEqual(stored(), [["ewan", "ewan@example.com"], ["presets", null], ["someone", "someone@example.com"]])
    await withdrawSubmission(context(`/api/submissions/${id}`, { method: "DELETE", cookie, params: { id: String(id) } }))
    assert.deepEqual(stored(), [["ewan", "ewan@example.com"], ["presets", null]])
  })

  test("refuses submissions until there is an email to send to", async () => {
    const noEmail = await signIn("discord", { id: "6", username: "phone", email: null })
    assert.match((await send(noEmail)).error, /Add an email address to your Discord account/)
    const unverified = await signIn("github", { id: 7, login: "fresh", emails: [{ email: "fresh@example.com", primary: true, verified: false }] })
    assert.equal((await send(unverified)).status, 201)
    assert.deepEqual(stored(), [["fresh", "fresh@example.com"]])
  })

  test("sends an email Resend refused with the next ones", async () => {
    const reviewer = await admin()
    const cookie = await signIn()
    resend.status = 500
    const { id } = await send(cookie)
    await Promise.all(waiting)
    assert.deepEqual(inbox(), [])
    resend.status = 200
    await comment(reviewer, id, "Looks good")
    assert.deepEqual(inbox().sort(), [["ewan@example.com", "someone sent Gold Bricks"], ["someone@example.com", "New comment on Gold Bricks"]])
    await comment(reviewer, id, "Still good")
    assert.deepEqual(inbox(), [["someone@example.com", "New comment on Gold Bricks"]])
  })

  test("keeps the address for a final email Resend refused, and forgets it once that email is sent", async () => {
    const reviewer = await admin()
    const cookie = await signIn()
    const first = await send(cookie)
    await Promise.all(waiting)
    inbox()
    resend.status = 500
    await hook("pull_request", closed(1, true, first.id))
    assert.deepEqual(inbox(), [])
    assert.deepEqual(stored(), [["ewan", "ewan@example.com"], ["someone", "someone@example.com"]])
    resend.status = 200
    const other = await signIn("discord", { id: "9", username: "another", email: "another@example.com", verified: true })
    const second = await send(other, { name: "Silver Bricks" })
    await comment(reviewer, second.id, "Looks good")
    assert.ok(inbox().some(([to, subject]) => to === "someone@example.com" && /Gold Bricks/.test(subject)))
    assert.deepEqual(stored(), [["ewan", "ewan@example.com"], ["someone", null], ["another", "another@example.com"]])
  })

  test("gives up on an email Resend says can never be sent", async () => {
    const reviewer = await admin()
    const cookie = await signIn()
    resend.status = 422
    const { id } = await send(cookie)
    await Promise.all(waiting)
    resend.status = 200
    await comment(reviewer, id, "Looks good")
    assert.deepEqual(inbox(), [["someone@example.com", "New comment on Gold Bricks"]])
  })

  test("emails reviewers and the submitter everything they are notified about", async () => {
    const reviewer = await admin()
    const cookie = await signIn()
    const { id } = await send(cookie)
    await Promise.all(waiting)
    assert.deepEqual(inbox(), [["ewan@example.com", "someone sent Gold Bricks"]])
    await comment(cookie, id, "is this ok?")
    await comment(reviewer, id, "change the <b>")
    const [toReviewer, toSubmitter] = emails.slice()
    assert.deepEqual(inbox(), [["ewan@example.com", "New comment on Gold Bricks"], ["someone@example.com", "New comment on Gold Bricks"]])
    assert.equal(toReviewer.text, `New comment on Gold Bricks.\n\nis this ok?\n\nReply: https://mctitlegenerator.com/submissions/${id}`)
    assert.match(toSubmitter.html, /change the &#60;b&#62;/)
    await review(reviewer, id)
    assert.deepEqual(inbox(), [["someone@example.com", "Gold Bricks was published"]])
    assert.deepEqual(stored(), [["ewan", "ewan@example.com"], ["someone", null]])
  })

  test("emails one change until the reviewer has seen it", async () => {
    const reviewer = await admin()
    const cookie = await signIn()
    const { id } = await send(cookie)
    await edit(cookie, id, { name: "Shiny Gold" })
    await edit(cookie, id, { name: "Shinier Gold" })
    await Promise.all(waiting)
    assert.deepEqual(inbox().map(([, subject]) => subject), ["someone sent Gold Bricks", "someone changed Shiny Gold"])
    await markNotificationsSeen(context("/api/notifications", { method: "POST", cookie: reviewer }))
    await edit(cookie, id, { name: "Shiniest Gold" })
    await Promise.all(waiting)
    assert.deepEqual(inbox().map(([, subject]) => subject), ["someone changed Shiniest Gold"])
  })

  test("emails reviewers about issues, pull requests and comments on GitHub, skipping bots and themselves", async () => {
    await admin()
    const person = { login: "mate", id: 5, type: "User" }
    await hook("issues", { action: "opened", issue: { number: 40, title: "Fonts are blurry", body: "On every title", html_url: "https://github.com/i/40", user: person } })
    await hook("pull_request", { action: "opened", pull_request: { number: 41, title: "Add a font", body: "", html_url: "https://github.com/p/41", user: person } })
    await hook("issue_comment", { action: "created", issue: { number: 40, title: "Fonts are blurry" }, comment: { body: "Same here", author_association: "NONE", html_url: "https://github.com/c/1", user: person } })
    await hook("pull_request_review", { action: "submitted", pull_request: { number: 41, title: "Add a font" }, review: { state: "changes_requested", body: "", html_url: "https://github.com/r/1", user: { login: "ewan", id: 77, type: "User" }, author_association: "OWNER" } })
    await hook("issue_comment", { action: "created", issue: { number: 40, title: "Fonts are blurry" }, comment: { body: "Deployed", author_association: "NONE", html_url: "https://github.com/c/2", user: { login: "cloudflare-workers-and-pages[bot]", id: 3, type: "Bot" } } })
    await hook("issues", { action: "opened", issue: { number: 42, title: "Mine", body: "", html_url: "https://github.com/i/42", user: { login: "ewan", id: 77, type: "User" } } })
    assert.deepEqual(inbox(), [["ewan@example.com", "New issue: Fonts are blurry"], ["ewan@example.com", "New pull request: Add a font"], ["ewan@example.com", "New comment on Fonts are blurry"]])
  })

  test("comments on a submission's pull request are emailed once, and not to the commenter's other accounts", async () => {
    await admin()
    await signIn("discord", { id: "88", username: "ewan", email: "ewan@example.com", verified: true })
    db.prepare("UPDATE users SET admin = 1 WHERE provider = 'discord' AND provider_id = '88'").run()
    await signIn("discord", { id: "88", username: "ewan", email: "ewan@example.com", verified: true })
    const cookie = await signIn()
    await send(cookie)
    await Promise.all(waiting)
    inbox()
    await hook("issue_comment", { action: "created", issue: { number: 1, title: "Gold Bricks" }, comment: { body: "Nice", author_association: "OWNER", html_url: "https://github.com/c/3", user: { login: "ewan", id: 77, type: "User" } } })
    assert.deepEqual(inbox(), [["someone@example.com", "New comment on Gold Bricks"]])
    await hook("issue_comment", { action: "created", issue: { number: 1, title: "Gold Bricks" }, comment: { body: "Cool", author_association: "NONE", html_url: "https://github.com/c/4", user: { login: "random", id: 6, type: "User" } } })
    assert.deepEqual(inbox(), [["ewan@example.com", "New comment on Gold Bricks"]])
  })

  async function review(cookie, id) {
    await reviewSubmission(context(`/api/submissions/${id}/review`, { method: "POST", body: JSON.stringify({ action: "merge", revision: revisionOf(id) }), cookie, params: { id: String(id) } }))
    await Promise.all(waiting)
  }
})
