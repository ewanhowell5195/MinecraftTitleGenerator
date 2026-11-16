import { close } from "./assert.js"

export function glyphOf(rows, extra = {}) {
  const height = rows.length
  const bottom = extra.bottom ?? 0
  return { width: rows[0].length, height, mask: Uint8Array.from(rows.toReversed().join(""), char => Number(char)), bottom, top: bottom + height, placedX: 0, ...extra }
}

export function solid(width, height, extra) {
  return glyphOf(new Array(height).fill("1".repeat(width)), extra)
}

export function rowsOf(alpha, columns) {
  const rows = []
  for (let at = 0; at < alpha.length; at += columns) rows.push(Array.from(alpha.subarray(at, at + columns)))
  return rows
}

export function picture(alpha, columns) {
  return rowsOf(alpha, columns).map(row => row.map(value => value === 1 ? "1" : value === 0 ? "0" : "?").join(""))
}

export function columnOf(alpha, columns, index) {
  return rowsOf(alpha, columns).map(row => row[index])
}

export const near = (actual, expected, tolerance = 0.001) => close(actual, expected, tolerance)
