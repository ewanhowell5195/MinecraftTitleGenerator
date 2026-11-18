import { LIMITS } from "../../lib/core/limits.js"

export const SORTS = [{ value: "week", label: "Popular this week" }, { value: "popular", label: "Popular all time" }, { value: "top", label: "Top rated" }, { value: "new", label: "Newest" }, { value: "needs", label: "Needs votes" }]

export function ratingText(rating) {
  return rating.toFixed(1)
}

export function votesToGo(votes) {
  return Math.max(1, LIMITS.minVotes - votes)
}

export function toGoText(votes) {
  const count = votesToGo(votes)
  return `${count} more ${count === 1 ? "vote" : "votes"} and it gets a rating`
}

export function votesText(votes) {
  return `from ${votes} votes`
}

export function usesText({ downloads, week }) {
  if (!downloads) return "Not used yet"
  const total = `${downloads} ${downloads === 1 ? "use" : "uses"} in total`
  return week === undefined ? total : `${total}, ${week || "none"} in the last 7 days`
}

export function sharedText(createdAt) {
  return new Date(createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
}
