import { fullName } from "../../lib/font/catalog.js"
import { DEFAULT_FONT } from "../../lib/settings/defaults.js"
import { popular } from "../../lib/title/popularity.js"
import { fontThumbnail } from "../../lib/font/thumbnailUrls.js"

export function fontOptions(list, fonts) {
  return list.map(font => ({ value: font.id, label: fullName(font, fonts), image: fontThumbnail(font) }))
}

export function popularFontOptions(list, fonts) {
  return fontOptions(popular(list, font => font.id, font => fullName(font, fonts), [DEFAULT_FONT]), fonts)
}
