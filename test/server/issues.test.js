import { afterEach, beforeEach, describe, test } from "node:test"
import assert from "node:assert/strict"
import { REPO, context, hook, serverEnv, signIn } from "../helpers/server.js"
import { TEXTURES } from "../helpers/submissionServer.js"

const { accountDetails } = await import("../../src/server/accounts.js")
const { deleteAccount } = await import("../../src/server/accountDeletion.js")
const { addIssueComment, closeIssue, createIssue, issueDetails, listIssues } = await import("../../src/server/issues/index.js")
const { listNotifications } = await import("../../src/server/submissions/notifications.js")

let db
let emails
let gh
let restore
let waiting

beforeEach(() => {
  ({ db, emails, gh, restore, waiting } = serverEnv({ files: [TEXTURES], env: { IP_SALT: "salt" } }))
})

afterEach(() => restore())

async function admin() {
  db.prepare("INSERT INTO users (provider, provider_id, name, created_at, admin) VALUES ('github', '77', 'ewan', 0, 1)").run()
  return signIn("github", { id: 77, login: "ewan" })
}

const PNG_BYTES = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3])
const JPEG_BYTES = new Uint8Array([255, 216, 255, 224, 4, 5])
const TITLE_FILE = JSON.stringify({ format: "minecraft-title", version: 9, lines: [{ text: "hi" }] })

function reportForm(fields, { images = [], titleFile = null } = {}) {
  const data = new FormData()
  for (const [key, value] of Object.entries({ title: "Fonts are blurry", body: "On every title.", ...fields })) {
    if (value !== null) data.set(key, value)
  }
  for (const image of images) data.append("image", new Blob([image]), "image")
  if (titleFile) data.set("titleFile", new Blob([titleFile]), "title.mctitle")
  return data
}

async function report(cookie, fields = {}, files = {}) {
  const response = await createIssue(context("/api/issues", { method: "POST", body: reportForm(fields, files), cookie }))
  await Promise.all(waiting)
  return { status: response.status, ...await response.json() }
}

async function details(cookie, id) {
  const response = await issueDetails(context(`/api/issues/${id}`, { cookie, params: { id: String(id) } }))
  return { status: response.status, ...await response.json() }
}

async function comment(cookie, id, body) {
  const response = await addIssueComment(context(`/api/issues/${id}/comments`, { method: "POST", body: { body }, cookie, params: { id: String(id) } }))
  await Promise.all(waiting)
  return { status: response.status, ...await response.json() }
}

async function list(cookie, review = false) {
  const response = await listIssues(context(`/api/issues${review ? "?review" : ""}`, { cookie }))
  return { status: response.status, ...await response.json() }
}

async function news(cookie) {
  return (await (await listNotifications(context("/api/notifications", { cookie }))).json()).notifications.map(item => [item.kind, item.author, item.issue, item.submissionName])
}

function inbox() {
  return emails.splice(0).map(email => [email.to, email.subject])
}

function stored(id) {
  return db.prepare("SELECT status, number, user_id AS userId FROM issues WHERE id = ?").get(id)
}

describe("reporting issues", () => {
  test("needs an account with an email", async () => {
    assert.equal((await report(null)).status, 401)
    const cookie = await signIn("discord", { id: "9", username: "quiet", verified: true })
    assert.match((await report(cookie)).error, /Add an email address/)
  })

  test("opens a GitHub issue with the text quoted, and tells reviewers", async () => {
    await admin()
    const cookie = await signIn()
    const { status, id } = await report(cookie, { body: "It's `bad`\n@everyone", code: "QAREabc_-1" })
    assert.equal(status, 201)
    const issue = gh.issues.get(stored(id).number)
    assert.equal(issue.title, "Fonts are blurry")
    assert.equal(issue.body, "Reported from the website by ` someone ` (discord).\n\n**[Open the title in the generator](https://mctitlegenerator.com/app/?title=QAREabc_-1)**\n\n> It's \\`bad\\`\n> `@everyone`")
    assert.deepEqual(inbox(), [["ewan@example.com", "someone reported Fonts are blurry"]])
    assert.equal((await (await accountDetails(context("/api/account", { cookie }))).json()).user.issues, 1)
  })

  test("attaches images and the title file on the issue-files branch", async () => {
    const cookie = await signIn()
    const { id } = await report(cookie, { code: "QAREabc" }, { images: [PNG_BYTES, JPEG_BYTES], titleFile: TITLE_FILE })
    const head = gh.refs.get("heads/issue-files")
    const files = Array.from(gh.filesAt(head).keys())
    assert.equal(files.length, 3)
    const folder = files[0].split("/").slice(0, 2).join("/")
    assert.deepEqual(files, [`${folder}/image-1.png`, `${folder}/image-2.jpg`, `${folder}/title.mctitle`])
    assert.match(gh.commits.get(head).message, /^\[CF-Pages-Skip\] /)
    const raw = path => `https://raw.githubusercontent.com/${REPO}/${head}/${folder}/${path}`
    const body = gh.issues.get(stored(id).number).body
    const opened = `/app/?title=${encodeURIComponent(raw("title.mctitle"))}`
    assert.ok(body.includes(`**[Open the title in the generator](https://mctitlegenerator.com${opened})**\n\nIt has uploaded fonts or textures, so the link opens its attached **[title file](https://github.com/${REPO}/blob/${head}/${folder}/title.mctitle)**.`))
    assert.ok(body.endsWith(`![Image 1](${raw("image-1.png")})\n![Image 2](${raw("image-2.jpg")})`))
    const shown = (await details(cookie, id)).issue
    assert.deepEqual(shown.files.map(file => [file.kind, file.url]), [["image", raw("image-1.png")], ["image", raw("image-2.jpg")], ["title", raw("title.mctitle")]])
    assert.equal(shown.titleLink, opened)
    const second = await report(cookie, {}, { images: [PNG_BYTES] })
    const next = gh.refs.get("heads/issue-files")
    assert.deepEqual(gh.commits.get(next).parents, [head])
    assert.equal((await details(cookie, second.id)).issue.files.length, 1)
  })

  test("refuses bad attachments", async () => {
    const cookie = await signIn()
    assert.equal((await report(cookie, {}, { images: [new Uint8Array([1, 2, 3])] })).error, "Images have to be PNG or JPEG files.")
    assert.equal((await report(cookie, {}, { images: [PNG_BYTES, PNG_BYTES, PNG_BYTES, PNG_BYTES, PNG_BYTES] })).error, "A report can have up to 4 images.")
    assert.equal((await report(cookie, {}, { titleFile: TITLE_FILE })).error, "This report isn't valid.")
    assert.equal((await report(cookie, { code: "QAREabc" }, { titleFile: "{\"format\":\"something\"}" })).error, "This report isn't valid.")
    assert.equal(gh.issues.size, 0)
  })

  test("refuses bad fields and too many reports a day", async () => {
    const cookie = await signIn()
    assert.match((await report(cookie, { title: " " })).error, /Give the report a title/)
    assert.match((await report(cookie, { body: "" })).error, /Give the report a description/)
    assert.equal((await report(cookie, { body: null })).error, "The description has to be text.")
    assert.equal((await report(cookie, { code: "not a code!" })).error, "The title link isn't valid.")
    for (let count = 0; count < 5; count++) assert.equal((await report(cookie)).status, 201)
    assert.equal((await report(cookie)).status, 429)
    assert.equal(gh.issues.size, 5)
  })

  test("gives the daily slot back when GitHub fails", async () => {
    const cookie = await signIn()
    gh.failing.add(`POST /repos/${REPO}/issues`)
    const failed = await report(cookie)
    assert.equal(failed.status, 502)
    assert.equal(failed.error, "GitHub isn't taking reports right now. Try again in a few minutes.")
    gh.failing.clear()
    for (let count = 0; count < 5; count++) assert.equal((await report(cookie)).status, 201)
  })

  test("anyone can see a report, but only its reporter and reviewers can list it", async () => {
    const reviewer = await admin()
    const cookie = await signIn()
    const other = await signIn("discord", { id: "55", username: "other", email: "other@example.com", verified: true })
    const { id } = await report(cookie, { code: "QAREabc" })
    const mine = await details(cookie, id)
    assert.equal(mine.issue.mine, true)
    assert.equal(mine.issue.titleLink, "/app/?title=QAREabc")
    assert.equal(mine.issue.issueUrl, `https://github.com/${REPO}/issues/${stored(id).number}`)
    for (const viewer of [reviewer, other, null]) {
      const seen = await details(viewer, id)
      assert.equal(seen.status, 200)
      assert.deepEqual(seen.issue, { ...mine.issue, mine: false })
      assert.deepEqual(seen.comments, [])
    }
    assert.equal((await list(null)).status, 401)
    assert.deepEqual((await list(cookie)).issues.map(item => item.id), [id])
    assert.deepEqual((await list(other)).issues, [])
    assert.equal((await list(other, true)).status, 403)
    assert.deepEqual((await list(reviewer, true)).issues.map(item => item.id), [id])
  })
})

describe("following a report", () => {
  test("comments go to GitHub and notify the other side", async () => {
    const reviewer = await admin()
    const cookie = await signIn()
    const { id } = await report(cookie)
    inbox()
    const sent = await comment(cookie, id, "Still broken")
    assert.equal(sent.status, 201)
    assert.deepEqual(sent.comments.map(item => [item.author, item.role, item.body]), [["someone", "reporter", "Still broken"]])
    assert.deepEqual(inbox(), [["ewan@example.com", "New comment on Fonts are blurry"]])
    await comment(reviewer, id, "Fixed in the next update")
    assert.deepEqual(inbox(), [["someone@example.com", "New comment on Fonts are blurry"]])
    assert.deepEqual((await news(cookie)).map(([kind, author, issue, name]) => [kind, author, issue, name]), [["comment", "ewan", id, "Fonts are blurry"]])
  })

  test("anyone signed in can comment, up to the daily limit", async () => {
    await admin()
    const cookie = await signIn()
    const { id } = await report(cookie)
    inbox()
    const other = await signIn("discord", { id: "55", username: "other", verified: true })
    assert.equal((await comment(null, id, "Me too")).error, "Sign in to comment.")
    const sent = await comment(other, id, "Me too")
    assert.equal(sent.status, 201)
    assert.deepEqual(sent.comments.map(item => [item.author, item.role, item.body]), [["other", "commenter", "Me too"]])
    assert.deepEqual(inbox().sort(), [["ewan@example.com", "New comment on Fonts are blurry"], ["someone@example.com", "New comment on Fonts are blurry"]])
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM users WHERE provider_id = '55'").get().count, 0)
    db.prepare("UPDATE account_submissions SET count = 50").run()
    assert.equal((await comment(other, id, "Again")).status, 429)
  })

  test("only the reporter can close it", async () => {
    const reviewer = await admin()
    const { id } = await report(await signIn())
    const closing = async cookie => (await closeIssue(context(`/api/issues/${id}/close`, { method: "POST", cookie, params: { id: String(id) } }))).status
    assert.equal(await closing(await signIn("discord", { id: "55", username: "other", verified: true })), 403)
    assert.equal(await closing(reviewer), 403)
    assert.equal(await closing(null), 401)
    assert.equal(stored(id).status, "open")
  })

  test("comments from collaborators on GitHub reach the reporter", async () => {
    await admin()
    const cookie = await signIn()
    const { id } = await report(cookie)
    const number = stored(id).number
    inbox()
    await hook("issue_comment", { action: "created", issue: { number, title: "Fonts are blurry" }, comment: { body: "Can you share a screenshot?", author_association: "OWNER", html_url: "https://github.com/c/1", user: { login: "ewan", id: 77, type: "User" } } })
    assert.deepEqual(inbox(), [["someone@example.com", "New comment on Fonts are blurry"]])
    await hook("issue_comment", { action: "created", issue: { number, title: "Fonts are blurry" }, comment: { body: "Same", author_association: "NONE", html_url: "https://github.com/c/2", user: { login: "random", id: 6, type: "User" } } })
    assert.deepEqual(inbox(), [["ewan@example.com", "New comment on Fonts are blurry"]])
    gh.comment(number, "Can you share a screenshot?", { user: { login: "ewan", type: "User" }, association: "OWNER", app: false })
    assert.deepEqual((await details(cookie, id)).comments.map(item => [item.author, item.role]), [["ewan", "reviewer"]])
  })

  test("comments from before they were quoted are still read", async () => {
    const cookie = await signIn()
    const { id } = await report(cookie)
    gh.comment(stored(id).number, "` someone ` (reporter) commented on the site:\n\n```text\nAn **old** one\n```")
    gh.comment(stored(id).number, "The reporter commented on the site:\n\n```text\nOlder\n```")
    assert.deepEqual((await details(cookie, id)).comments.map(item => [item.author, item.body]), [["someone", "An **old** one"], ["", "Older"]])
  })

  test("closing on GitHub marks it fixed or closed and tells the reporter", async () => {
    const cookie = await signIn()
    const { id } = await report(cookie)
    const number = stored(id).number
    await hook("issues", { action: "closed", sender: { login: "ewan", id: 77, type: "User" }, issue: { number, state_reason: "completed", html_url: "https://github.com/i/1" } })
    assert.equal(stored(id).status, "fixed")
    assert.deepEqual(inbox(), [["someone@example.com", "Fonts are blurry was fixed"]])
    await hook("issues", { action: "reopened", sender: { login: "ewan", id: 77, type: "User" }, issue: { number, state_reason: "reopened", html_url: "https://github.com/i/1" } })
    assert.equal(stored(id).status, "open")
    await hook("issues", { action: "closed", sender: { login: "ewan", id: 77, type: "User" }, issue: { number, state_reason: "not_planned", html_url: "https://github.com/i/1" } })
    assert.equal(stored(id).status, "closed")
    assert.deepEqual((await news(cookie)).map(([kind]) => kind), ["closed", "reopened", "fixed"])
  })

  test("the reporter can close it, and their email is let go", async () => {
    const cookie = await signIn()
    const { id } = await report(cookie)
    const number = stored(id).number
    const response = await closeIssue(context(`/api/issues/${id}/close`, { method: "POST", cookie, params: { id: String(id) } }))
    assert.equal((await response.json()).issue.status, "closed")
    assert.equal(gh.issues.get(number).state, "closed")
    assert.equal(gh.comments.at(-1).body, "Closed by the person who reported it, on the site.")
    assert.equal(db.prepare("SELECT email FROM users WHERE provider_id = '1234'").get().email, null)
    await hook("issues", { action: "closed", sender: { login: "app[bot]", id: 1, type: "Bot" }, issue: { number, state_reason: "not_planned", html_url: "https://github.com/i/1" } })
    assert.deepEqual(await news(cookie), [])
    const again = await closeIssue(context(`/api/issues/${id}/close`, { method: "POST", cookie, params: { id: String(id) } }))
    assert.equal(again.status, 409)
  })

  test("deleting the issue on GitHub removes the report", async () => {
    const cookie = await signIn()
    const { id } = await report(cookie)
    await hook("issues", { action: "deleted", issue: { number: stored(id).number } })
    assert.equal(stored(id), undefined)
    assert.equal((await details(cookie, id)).status, 404)
  })
})

describe("deleting an account with reports", () => {
  async function remove(cookie, mode) {
    return deleteAccount(context("/api/account/delete", { method: "POST", body: { mode }, cookie }))
  }

  test("keeps or removes the report, and leaves GitHub alone", async () => {
    for (const mode of ["anonymise", "remove"]) {
      const cookie = await signIn()
      const { id } = await report(cookie)
      const number = stored(id).number
      await comment(cookie, id, "More details")
      const { body } = gh.issues.get(number)
      const commented = gh.comments.at(-1).body
      assert.equal((await remove(cookie, mode)).status, 200)
      assert.equal(gh.issues.get(number).body, body)
      assert.equal(gh.comments.at(-1).body, commented)
      if (mode === "anonymise") assert.deepEqual({ ...stored(id) }, { status: "open", number, userId: null })
      else assert.equal(stored(id), undefined)
    }
  })
})
