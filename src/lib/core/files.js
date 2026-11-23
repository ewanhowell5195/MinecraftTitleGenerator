export function download(name, url) {
  const link = document.createElement("a")
  link.download = name
  link.href = url
  link.click()
}

export function downloadBlob(name, blob) {
  const url = URL.createObjectURL(blob)
  download(name, url)
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}

export function canvasBlob(canvas) {
  return new Promise((resolve, reject) => canvas.toBlob(encoded => encoded ? resolve(encoded) : reject(new Error("could not encode the render")), "image/png"))
}

export function takeFile(event) {
  const file = event.target.files[0]
  event.target.value = ""
  return file
}

export function readDataUrl(file, apply) {
  const reader = new FileReader()
  reader.onload = () => apply(reader.result)
  reader.readAsDataURL(file)
}
