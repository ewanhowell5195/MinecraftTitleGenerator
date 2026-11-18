const THUMBNAILS = "https://thumbnails.mctitlegenerator.com"

export function previewAlt(name) {
  return `A preview of the ${name} title`
}

export function pictureUrl({ code, fingerprint }, format = "webp") {
  return `${THUMBNAILS}/${fingerprint ? `p/${fingerprint}` : `t/${code}`}.${format}`
}
