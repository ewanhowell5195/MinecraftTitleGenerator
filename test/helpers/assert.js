import assert from "node:assert/strict"

export function close(actual, expected, tolerance = 1e-6) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not within ${tolerance} of ${expected}`)
}

export function closeAll(actual, expected, tolerance = 1e-6) {
  assert.equal(actual.length, expected.length)
  for (const [index, value] of actual.entries()) assert.ok(Math.abs(value - expected[index]) <= tolerance, `[${actual}] is not within ${tolerance} of [${expected}]`)
}
