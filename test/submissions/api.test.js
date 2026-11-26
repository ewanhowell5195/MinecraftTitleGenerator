import { afterEach, describe, test } from "node:test"
import assert from "node:assert/strict"
import { apiCall, fetched, jsonOptions } from "#lib/core/api.js"

const realFetch = globalThis.fetch

function replyWith(status, body) {
  globalThis.fetch = async () => new Response(body, { status })
}

afterEach(() => {
  globalThis.fetch = realFetch
})

describe("jsonOptions", () => {
  test("sends the body as JSON", () => {
    assert.deepEqual(jsonOptions("PATCH", { name: "New" }), { method: "PATCH", headers: { "Content-Type": "application/json" }, body: '{"name":"New"}' })
  })

  test("sends an empty object when there is no body", () => {
    assert.equal(jsonOptions("POST").body, "{}")
  })
})

describe("apiCall", () => {
  test("returns the reply's JSON", async () => {
    replyWith(200, '{"presets":[1]}')
    assert.deepEqual(await apiCall("/api", undefined, "Not available", () => {}), { presets: [1] })
  })

  test("passes the url and options to fetch", async () => {
    const calls = []
    globalThis.fetch = async (...args) => {
      calls.push(args)
      return new Response("{}")
    }
    const options = jsonOptions("POST", { value: 1 })
    await apiCall("/api/thing", options, "Not available", () => {})
    assert.deepEqual(calls, [["/api/thing", options]])
  })

  test("fails with the server's message, status and id", async () => {
    replyWith(409, '{"error":"Already shared.","id":7}')
    await assert.rejects(apiCall("/api", undefined, "Not available", () => {}), err => err.message === "Already shared." && err.status === 409 && err.id === 7)
  })

  test("falls back to the unavailable message when the reply has no error", async () => {
    replyWith(404, "<html>")
    await assert.rejects(apiCall("/api", undefined, "Not available", () => {}), err => err.message === "Not available (404)." && err.status === 404 && err.id === undefined)
  })

  test("a server error page means the site can't be reached", async () => {
    replyWith(502, "<html>")
    await assert.rejects(apiCall("/api", undefined, "Not available", () => {}), err => err.unreachable && /can't be reached/.test(err.message))
  })

  test("a server error with its own message keeps it", async () => {
    replyWith(500, '{"error":"Database is busy."}')
    await assert.rejects(apiCall("/api", undefined, "Not available", () => {}), err => !err.unreachable && err.message === "Database is busy.")
  })

  test("a failed request means the site can't be reached", async () => {
    globalThis.fetch = async () => {
      throw new TypeError("Failed to fetch")
    }
    await assert.rejects(apiCall("/api", undefined, "Not available", () => {}), err => err.unreachable && err.cause.message === "Failed to fetch")
  })

  test("an aborted request stays aborted", async () => {
    globalThis.fetch = async () => {
      throw new DOMException("The operation was aborted.", "AbortError")
    }
    await assert.rejects(apiCall("/api", undefined, "Not available", () => {}), err => err.name === "AbortError")
  })

  test("an OK reply that isn't JSON fails too", async () => {
    replyWith(200, "<html>")
    await assert.rejects(apiCall("/api", undefined, "Not available", () => {}), /^Error: Not available \(200\)\.$/)
  })

  test("a 401 reports the sign out, and nothing else does", async () => {
    let signedOut = 0
    replyWith(401, '{"error":"Sign in first."}')
    await assert.rejects(apiCall("/api", undefined, "Not available", () => signedOut++), /Sign in first/)
    assert.equal(signedOut, 1)
    replyWith(403, '{"error":"Not yours."}')
    await assert.rejects(apiCall("/api", undefined, "Not available", () => signedOut++), /Not yours/)
    replyWith(200, "{}")
    await apiCall("/api", undefined, "Not available", () => signedOut++)
    assert.equal(signedOut, 1)
  })
})

describe("fetched", () => {
  test("returns the response when it loaded", async () => {
    replyWith(200, "hello")
    assert.equal(await (await fetched("/file", "the file")).text(), "hello")
  })

  test("names what failed and the status", async () => {
    replyWith(404, "missing")
    await assert.rejects(fetched("/file", "the Minecraft Ten template"), /^Error: the Minecraft Ten template could not be loaded \(404\)$/)
  })
})
