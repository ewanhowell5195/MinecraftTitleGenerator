import * as THREE from "three"
import { FXAA_FRAGMENT, FXAA_VERTEX } from "./fxaa.js"

export function createSmoothing(renderer) {
  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter })
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array([-1, -1, 3, -1, -1, 3]), 2))
  geometry.boundingSphere = new THREE.Sphere()
  const material = new THREE.RawShaderMaterial({ vertexShader: FXAA_VERTEX, fragmentShader: FXAA_FRAGMENT, defines: { LINEAR_INPUT: "" }, uniforms: { scene: { value: target.texture }, pixel: { value: new THREE.Vector2() } }, blending: THREE.NoBlending, depthTest: false, depthWrite: false })
  const pass = new THREE.Mesh(geometry, material)
  pass.frustumCulled = false
  const smoothing = new THREE.Scene()
  smoothing.add(pass)
  const camera = new THREE.Camera()

  function resize() {
    const { x, y } = renderer.getDrawingBufferSize(new THREE.Vector2())
    target.setSize(x, y)
    material.uniforms.pixel.value.set(1 / x, 1 / y)
  }

  function draw(scene, view) {
    renderer.setRenderTarget(target)
    renderer.render(scene, view)
    renderer.setRenderTarget(null)
    renderer.render(smoothing, camera)
  }

  function dispose() {
    target.dispose()
    geometry.dispose()
    material.dispose()
  }

  resize()
  return { resize, draw, dispose }
}
