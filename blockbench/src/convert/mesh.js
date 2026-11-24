import { keyOf } from "./quads.js"

const round = value => Math.roundTo(value, 4)

export function makeMesh({ name, faces, centre, origin, textures }) {
  const mesh = new Mesh({ name, vertices: {}, origin: centre.clone().add(origin).toArray().map(round) })
  const keys = new Map()

  function vertex(point) {
    const key = keyOf(point)
    if (!keys.has(key)) keys.set(key, mesh.addVertices(point.clone().sub(centre).toArray().map(round))[0])
    return keys.get(key)
  }

  for (const { points, uvs, page } of faces) {
    const vertices = points.map(vertex)
    if (new Set(vertices).size < vertices.length) continue
    const uv = Object.fromEntries(vertices.map((key, index) => [key, uvs[index].map(round)]))
    mesh.addFaces(new MeshFace(mesh, { vertices, uv, texture: textures[page].uuid }))
  }
  return mesh
}
