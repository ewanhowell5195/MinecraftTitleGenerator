export function dateTime(time) {
  return new Date(time).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
}
