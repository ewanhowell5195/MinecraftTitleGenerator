import { PNG } from "pngjs"

export function pngOf(width, height, pixel = [200, 200, 200, 200]) {
  const image = new PNG({ width, height })
  if (typeof pixel === "function") {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) image.data.set(pixel(x, y), (y * width + x) * 4)
    }
  } else image.data.fill(Uint8Array.from(pixel))
  return PNG.sync.write(image)
}
