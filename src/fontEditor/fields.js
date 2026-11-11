export function typedNumber(event, shown, valid) {
  const value = event.target.valueAsNumber
  if (valid(value)) return value
  if (event.type === "change") event.target.value = shown
  return null
}
