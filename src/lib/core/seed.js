export const SEED_ID = "community-seed"

export function seedScript(seed) {
  return `<script type="application/json" id="${SEED_ID}">${JSON.stringify(seed).replace(/</g, "\\u003c")}</script>`
}
