import { image } from "../texture/assets.js"
import { surface } from "../texture/canvas.js"
import { download } from "../core/files.js"

export async function saveImage(path, name) {
  const source = await image(path)
  const { canvas, ctx } = surface(source.width, source.height)
  ctx.drawImage(source, 0, 0)
  download(name, canvas.toDataURL())
}

export async function saveSheet(font, kind, id) {
  const [source, flat] = await Promise.all([image(`${font.sheetFolder}/${kind}/${id}.png`), image(`${font.sheetFolder}/textures/flat.png`)])
  const height = flat.height * source.width / flat.width
  const { canvas, ctx } = surface(source.width, height)
  ctx.drawImage(source, 0, 0, source.width, height)
  download(`${id}.png`, canvas.toDataURL())
}
