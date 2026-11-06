export const PROVIDERS = [{ id: "discord", label: "Discord" }, { id: "github", label: "GitHub" }]
export const ACCOUNT_CHANNEL = "minecraft-title-account"
export const SIGN_IN_RETURN = "minecraft-title-sign-in-return"

export function providerLabel(id) {
  return PROVIDERS.find(provider => provider.id === id).label
}
