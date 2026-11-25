let place = "this browser"

export function usePlace(name) {
  place = name
}

export function thisPlace() {
  return place
}
