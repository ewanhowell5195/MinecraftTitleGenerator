const QUIET = 500

let held = 0
let lastInput = -Infinity

function touched() {
  lastInput = performance.now()
}

if (typeof window !== "undefined") {
  window.addEventListener("pointerdown", () => {
    held++
    touched()
  }, true)
  for (const name of ["pointerup", "pointercancel"]) {
    window.addEventListener(name, () => {
      held = Math.max(0, held - 1)
      touched()
    }, true)
  }
  window.addEventListener("blur", () => (held = 0))
  for (const name of ["keydown", "wheel", "input"]) window.addEventListener(name, touched, { capture: true, passive: true })
}

export function userBusy() {
  return held > 0 || performance.now() - lastInput < QUIET
}
