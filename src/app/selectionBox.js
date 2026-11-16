import * as THREE from "three"

export function trackSelection(selection, entries, selected, total, camera) {
  const shown = selected.filter(id => entries.has(id))
  const meshes = shown.length < total ? shown.flatMap(id => entries.get(id).outline ?? entries.get(id).solid ?? []) : []
  selection.visible = meshes.length > 0
  if (!meshes.length) return
  const frame = shown.length === 1 ? meshes[0].parent.matrixWorld : entries.get(shown[0]).base
  const into = frame.clone().invert()
  const box = new THREE.Box3()
  for (const mesh of meshes) {
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox()
    box.union(mesh.geometry.boundingBox.clone().applyMatrix4(into.clone().multiply(mesh.parent.matrixWorld).multiply(mesh.matrix)))
  }
  const size = box.getSize(new THREE.Vector3())
  const centre = box.getCenter(new THREE.Vector3())
  selection.matrix.copy(frame).multiply(new THREE.Matrix4().makeTranslation(centre.x, centre.y, centre.z)).multiply(new THREE.Matrix4().makeScale(size.x, size.y, size.z))
  selection.matrixWorldNeedsUpdate = true
  const normals = new THREE.Matrix3().getNormalMatrix(selection.matrix)
  const forward = camera.getWorldDirection(new THREE.Vector3())
  function facing(normal) {
    const middle = normal.clone().multiplyScalar(0.5).applyMatrix4(selection.matrix)
    const toward = camera.isOrthographicCamera ? forward.clone().negate() : camera.position.clone().sub(middle)
    return normal.clone().applyMatrix3(normals).dot(toward) > 0
  }
  for (const edge of selection.children) edge.visible = facing(edge.userData.faces[0]) !== facing(edge.userData.faces[1])
}

export function wireBox(material) {
  const group = new THREE.Group()
  for (let along = 0; along < 3; along++) {
    const a = (along + 1) % 3
    const b = (along + 2) % 3
    for (const signA of [-1, 1]) {
      for (const signB of [-1, 1]) {
        const ends = [-0.5, 0.5].map(value => new THREE.Vector3().setComponent(a, signA * 0.5).setComponent(b, signB * 0.5).setComponent(along, value))
        const edge = new THREE.Line(new THREE.BufferGeometry().setFromPoints(ends), material)
        edge.userData.faces = [new THREE.Vector3().setComponent(a, signA), new THREE.Vector3().setComponent(b, signB)]
        edge.renderOrder = Number.MAX_SAFE_INTEGER
        group.add(edge)
      }
    }
  }
  return group
}
