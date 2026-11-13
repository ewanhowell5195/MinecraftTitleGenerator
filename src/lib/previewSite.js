export const PREVIEW_NOTICE = "This is a preview of the site, so nothing can be saved, shared or submitted here."

export function isPreviewHost(hostname) {
  return hostname.endsWith(".pages.dev")
}
