import assert from "node:assert/strict"
import { createHash, verify } from "node:crypto"
import fs from "node:fs"

export function fakeGitHub(publicKey, { repo, api, files }) {
  let count = 0
  const next = () => (++count).toString(16).padStart(40, "0")
  const blobs = new Map()
  const trees = new Map()
  const commits = new Map()
  const refs = new Map()
  const pulls = new Map()
  const comments = []
  const reviews = []
  const calls = []
  const failing = new Set()

  function comment(number, body, { user = { login: "app[bot]", type: "Bot" }, association = "NONE", app = true } = {}) {
    const id = comments.length + 1
    const made = { id, number, body, user, author_association: association, html_url: `https://github.com/${repo}/pull/${number}#issuecomment-${id}`, created_at: new Date(Date.UTC(2026, 0, 1) + id * 1000).toISOString(), ...(app && { performed_via_github_app: { id: 123 } }) }
    comments.push(made)
    return made
  }

  function blob(bytes) {
    const sha = createHash("sha1").update(bytes).digest("hex")
    blobs.set(sha, bytes)
    return sha
  }

  function commit(files, parents, message) {
    const tree = next()
    trees.set(tree, files)
    const sha = next()
    commits.set(sha, { tree, parents, message })
    return sha
  }

  const main = commit(new Map(files.map(file => [file, blob(fs.readFileSync(file))])), [], "start")
  refs.set("heads/main", main)

  function json(body, status = 200) {
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
  }

  function filesAt(ref) {
    const sha = refs.get(`heads/${ref}`) ?? ref
    return trees.get(commits.get(sha).tree)
  }

  function checkJwt(header) {
    const [head, payload, signature] = header.slice(7).split(".")
    assert.ok(verify("sha256", Buffer.from(`${head}.${payload}`), publicKey, Buffer.from(signature, "base64url")), "the app JWT is signed with the app key")
    assert.equal(JSON.parse(Buffer.from(payload, "base64url")).iss, "123")
  }

  async function handle(url, options = {}) {
    const method = options.method ?? "GET"
    const route = url.slice(api.length)
    const body = options.body ? JSON.parse(options.body) : null
    calls.push({ method, route, body })
    if (failing.has(`${method} ${route.replace(/\/\d+$/, "/:n")}`)) return json({ message: "broken" }, 500)
    if (route === `/repos/${repo}/installation`) {
      checkJwt(options.headers.Authorization)
      return json({ id: 7 })
    }
    if (route === "/app/installations/7/access_tokens") {
      checkJwt(options.headers.Authorization)
      return json({ token: "installation-token", expires_at: new Date(Date.now() + 3600000).toISOString() })
    }
    assert.equal(options.headers.Authorization, "Bearer installation-token")
    const at = route.slice(`/repos/${repo}/`.length)
    let match
    if (method === "POST" && at === "git/blobs") return json({ sha: blob(Buffer.from(body.content, "base64")) }, 201)
    if ((match = at.match(/^git\/blobs\/(\w+)$/))) return blobs.has(match[1]) ? new Response(blobs.get(match[1])) : json({}, 404)
    if ((match = at.match(/^git\/ref\/(.+)$/))) return json({ object: { sha: refs.get(match[1]) } })
    if ((match = at.match(/^git\/commits\/(\w+)$/))) return json({ tree: { sha: commits.get(match[1]).tree } })
    if ((match = at.match(/^contents\/(.+)\?ref=(.+)$/))) {
      const sha = filesAt(decodeURIComponent(match[2])).get(match[1])
      return sha ? new Response(blobs.get(sha)) : json({}, 404)
    }
    if (method === "POST" && at === "git/trees") {
      const files = new Map(trees.get(body.base_tree))
      for (const item of body.tree) files.set(item.path, item.sha ?? blob(Buffer.from(item.content)))
      const sha = next()
      trees.set(sha, files)
      return json({ sha }, 201)
    }
    if (method === "POST" && at === "git/commits") {
      const sha = next()
      commits.set(sha, { tree: body.tree, parents: body.parents, message: body.message })
      return json({ sha }, 201)
    }
    if ((match = at.match(/^git\/refs\/(.+)$/))) {
      if (!refs.has(match[1])) return json({ message: "Reference does not exist" }, 422)
      if (method === "DELETE") {
        refs.delete(match[1])
        return new Response(null, { status: 204 })
      }
      refs.set(match[1], body.sha)
      return json({})
    }
    if (method === "POST" && at === "git/refs") {
      refs.set(body.ref.slice(5), body.sha)
      return json({}, 201)
    }
    if (method === "POST" && at === "pulls") {
      const number = pulls.size + 1
      pulls.set(number, { ...body, number, state: "open", mergeable_state: "clean" })
      return json({ number }, 201)
    }
    if (method === "PUT" && (match = at.match(/^pulls\/(\d+)\/merge$/))) {
      const pull = pulls.get(Number(match[1]))
      if (pull.mergeable_state !== "clean") return json({ message: "Pull Request is not mergeable" }, 405)
      Object.assign(pull, { state: "closed", merged: true, merge_method: body.merge_method })
      return json({ merged: true })
    }
    if ((match = at.match(/^pulls\/(\d+)$/))) {
      const pull = pulls.get(Number(match[1]))
      if (method === "PATCH") Object.assign(pull, body)
      return json(pull)
    }
    if ((match = at.match(/^issues\/(\d+)\/comments(\?.*)?$/))) {
      if (method === "GET") return json(comments.filter(item => item.number === Number(match[1])))
      return json({ id: comment(Number(match[1]), body.body).id }, 201)
    }
    if ((match = at.match(/^pulls\/(\d+)\/reviews(\?.*)?$/))) return json(reviews.filter(item => item.number === Number(match[1])))
    if (method === "PATCH" && (match = at.match(/^issues\/comments\/(\d+)$/))) {
      const comment = comments[Number(match[1]) - 1]
      if (!comment) return json({ message: "Not Found" }, 404)
      comment.body = body.body
      return json({ id: Number(match[1]) })
    }
    throw new Error(`the fake GitHub has no ${method} ${route}`)
  }

  return { handle, refs, commits, pulls, comments, comment, reviews, calls, failing, filesAt, blobs, main: () => refs.get("heads/main"), commit, blob }
}
