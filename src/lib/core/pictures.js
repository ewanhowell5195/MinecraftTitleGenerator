export function previewAlt(name) {
  return `A preview of the ${name} title`
}

export function pictureUrl({ code, fingerprint }, format = "webp") {
  return `https://thumbnails.mctitlegenerator.com/${fingerprint ? `p/${fingerprint}` : `t/${code}`}.${format}`
}
