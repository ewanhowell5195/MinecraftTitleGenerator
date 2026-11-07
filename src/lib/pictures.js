const THUMBNAILS = "https://thumbnails.mctitlegenerator.com"

export function pictureUrl({ code, fingerprint }, format = "webp") {
  return `${THUMBNAILS}/${fingerprint ? `p/${fingerprint}` : `t/${code}`}.${format}`
}
