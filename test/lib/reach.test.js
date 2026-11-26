import { describe, test } from "node:test"
import assert from "node:assert/strict"
import { reachable } from "#lib/core/reach.js"

describe("reachable", () => {
  test("passes a reply through, even a missing file", async () => {
    const response = new Response("", { status: 404 })
    assert.equal(await reachable(Promise.resolve(response)), response)
  })

  test("a server error means the site can't be reached", async () => {
    await assert.rejects(reachable(Promise.resolve(new Response("", { status: 503 }))), err => err.unreachable && /can't be reached/.test(err.message))
  })

  test("a failed request means the site can't be reached", async () => {
    await assert.rejects(reachable(Promise.reject(new TypeError("Failed to fetch"))), err => err.unreachable && err.cause.message === "Failed to fetch")
  })

  test("an aborted request stays aborted", async () => {
    await assert.rejects(reachable(Promise.reject(new DOMException("The operation was aborted.", "AbortError"))), err => err.name === "AbortError" && !err.unreachable)
  })
})
