import assert from "node:assert/strict"
import path from "node:path"
import { test } from "node:test"
import { creditsHtml } from "../src/server/credits.js"

test("the credits page builds from the published fonts and textures, splitting shared credits", () => {
  const html = creditsHtml(path.resolve(import.meta.dirname, ".."))
  const people = Array.from(html.matchAll(/<h2>([^<]+)<\/h2><p>/g), match => match[1])
  assert.ok(people.length > 1)
  assert.equal(new Set(people).size, people.length)
  assert.ok(people.every(person => !/[,&]/.test(person)), people.filter(person => /[,&]/.test(person)).join(", "))
})
