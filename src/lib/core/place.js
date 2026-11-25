let place = "this browser"
let inside = "on this browser"

export function usePlace(name, within) {
  place = name
  inside = within
}

export function thisPlace() {
  return place
}

export function inThisPlace() {
  return inside
}
