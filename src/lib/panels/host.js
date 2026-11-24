export const host = {}

export function usePanelHost(values) {
  Object.defineProperties(host, Object.getOwnPropertyDescriptors(values))
}
