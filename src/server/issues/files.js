import { GitHubError, github, repository } from "../github.js"
import { PAGES_SKIP, uploadFile } from "../submissions/pulls.js"

export const FILES_BRANCH = "issue-files"
const TRIES = 3

async function headOf(env) {
  try {
    return (await github(env, `git/ref/heads/${FILES_BRANCH}`)).object.sha
  } catch (err) {
    if (err instanceof GitHubError && err.status === 404) return null
    throw err
  }
}

async function moved(env, parent, sha) {
  try {
    if (parent) await github(env, `git/refs/heads/${FILES_BRANCH}`, { method: "PATCH", body: { sha, force: false } })
    else await github(env, "git/refs", { method: "POST", body: { ref: `refs/heads/${FILES_BRANCH}`, sha } })
    return true
  } catch (err) {
    if (err instanceof GitHubError && err.status === 422) return false
    throw err
  }
}

export async function storeFiles(env, folder, files) {
  if (!files.length) return []
  const stored = []
  for (const file of files) stored.push({ kind: file.kind, path: `${folder}/${file.name}`, sha: await uploadFile(env, file.bytes) })
  const tree = await github(env, "git/trees", { method: "POST", body: { tree: stored.map(({ path, sha }) => ({ path, mode: "100644", type: "blob", sha })) } })
  for (let attempt = 0; attempt < TRIES; attempt++) {
    const parent = await headOf(env)
    const made = await github(env, "git/commits", { method: "POST", body: { message: `${PAGES_SKIP} add the files of a report`, tree: tree.sha, parents: parent ? [parent] : [] } })
    if (await moved(env, parent, made.sha)) return stored.map(({ kind, path }) => ({ kind, url: `https://raw.githubusercontent.com/${repository(env)}/${made.sha}/${path}`, page: `https://github.com/${repository(env)}/blob/${made.sha}/${path}` }))
  }
  throw new GitHubError(409, `the ${FILES_BRANCH} branch kept moving`)
}
