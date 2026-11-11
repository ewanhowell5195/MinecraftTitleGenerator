import * as THREE from "three"

function corner(mesh, at) {
  const { position, uv, color } = mesh.geometry.attributes
  return {
    key: `${position.getX(at)},${position.getY(at)},${position.getZ(at)},${uv.getX(at)},${uv.getY(at)}`,
    point: new THREE.Vector3().fromBufferAttribute(position, at).applyMatrix4(mesh.matrixWorld),
    uv: [uv.getX(at), uv.getY(at)],
    tint: color ? [color.getX(at), color.getY(at), color.getZ(at)] : [1, 1, 1]
  }
}

function loopOf(first, second) {
  const keys = new Set(first.map(item => item.key))
  const extra = second.find(item => !keys.has(item.key))
  const shared = first.filter(item => second.some(other => other.key === item.key))
  const lone = first.find(item => !shared.includes(item))
  if (!extra || !lone || shared.length !== 2) return null
  const loop = [lone, shared[0], extra, shared[1]]
  const outward = first[1].point.clone().sub(first[0].point).cross(first[2].point.clone().sub(first[0].point))
  const facing = loop[1].point.clone().sub(loop[0].point).cross(loop[3].point.clone().sub(loop[0].point))
  return facing.dot(outward) > 0 ? [loop[0], loop[3], loop[2], loop[1]] : loop
}

function flatUnder(node) {
  for (let at = node; at; at = at.parent) {
    if (at.userData.flat) return true
  }
  return false
}

function textureOf(material) {
  return material.uniforms?.map?.value ?? material.map ?? null
}

export function quadsOf(group) {
  const sources = new Map()
  const quads = []
  group.traverse(mesh => {
    if (!mesh.isMesh) return
    const { index, attributes } = mesh.geometry
    const count = index ? index.count : attributes.position.count
    const at = number => index ? index.getX(number) : number
    const groups = mesh.geometry.groups.length ? mesh.geometry.groups : [{ start: 0, count, materialIndex: 0 }]
    const flat = flatUnder(mesh)
    for (const { start, count: size, materialIndex } of groups) {
      const material = Array.isArray(mesh.material) ? mesh.material[materialIndex] : mesh.material
      const map = textureOf(material)
      if (!map || material.side === THREE.BackSide) continue
      if (!sources.has(map)) sources.set(map, { key: `texture${sources.size}`, image: map.image, flip: map.flipY })
      const source = sources.get(map)
      for (let triangle = start; triangle + 6 <= start + size; triangle += 6) {
        const first = [0, 1, 2].map(offset => corner(mesh, at(triangle + offset)))
        const second = [3, 4, 5].map(offset => corner(mesh, at(triangle + offset)))
        const loop = loopOf(first, second)
        if (!loop) continue
        const { width, height } = source.image
        quads.push({ points: loop.map(item => item.point.toArray()), texels: loop.map(({ uv: [u, v] }) => [u * width, (source.flip ? 1 - v : v) * height]), source: source.key, tint: loop[0].tint, flat })
      }
    }
  })
  return { quads, sources: Object.fromEntries(Array.from(sources.values(), source => [source.key, source.image])) }
}
