import * as THREE from "three"
import { toRad } from "../lib/core/maths.js"

const VERTEX = `
varying vec2 vUv;
varying vec3 vLocal;

void main() {
  vUv = uv;
  vLocal = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const FRAGMENT = `
uniform sampler2D dark;
uniform sampler2D light;
uniform sampler2D cover;
uniform mat4 coverMatrix;
uniform bool orthographic;
uniform float lens;
uniform vec3 fit;
uniform vec2 imageSize;
uniform vec2 pageSize;
uniform float detail;
uniform mat3 hue;
varying vec2 vUv;
varying vec3 vLocal;

vec3 texelCentre() {
  vec2 texel = vec2(vUv.x, 1.0 - vUv.y) * pageSize * detail;
  vec2 across = dFdx(texel);
  vec2 down = dFdy(texel);
  float area = across.x * down.y - across.y * down.x;
  if (abs(area) < 1e-8) return vLocal;
  vec2 offset = floor(texel) + 0.5 - texel;
  vec2 steps = vec2(offset.x * down.y - offset.y * down.x, across.x * offset.y - across.y * offset.x) / area;
  return vLocal + dFdx(vLocal) * steps.x + dFdy(vLocal) * steps.y;
}

vec2 imageAt(vec3 local) {
  vec4 seen = coverMatrix * vec4(local, 1.0);
  vec2 screen = orthographic ? vec2(seen.x / lens, seen.y / (lens * lens)) : seen.xy / -seen.z;
  vec2 pixel = floor((vec2(screen.x, -screen.y) - fit.xy) / fit.z);
  return (clamp(pixel, vec2(0.0), imageSize - 1.0) + 0.5) / imageSize;
}

void main() {
  vec4 low = sRGBTransferOETF(texture2D(dark, vUv));
  if (low.a < 0.5) discard;
  vec3 high = sRGBTransferOETF(texture2D(light, vUv)).rgb;
  vec3 image = clamp(hue * sRGBTransferOETF(texture2D(cover, imageAt(texelCentre()))).rgb, 0.0, 1.0);
  gl_FragColor = sRGBTransferEOTF(vec4(low.rgb + (high - low.rgb) * image, low.a));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

export function coverMaterial() {
  return new THREE.ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    uniforms: {
      dark: { value: null },
      light: { value: null },
      cover: { value: null },
      coverMatrix: { value: new THREE.Matrix4() },
      orthographic: { value: false },
      lens: { value: 1 },
      fit: { value: new THREE.Vector3() },
      imageSize: { value: new THREE.Vector2(1, 1) },
      pageSize: { value: new THREE.Vector2(1, 1) },
      detail: { value: 1 },
      hue: { value: new THREE.Matrix3() }
    }
  })
}

export function hueMatrix({ hue, saturation }) {
  const turn = toRad(hue)
  const c = Math.cos(turn)
  const s = Math.sin(turn)
  const amount = saturation / 100
  const rotated = new THREE.Matrix3().set(
    0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928,
    0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.140, 0.072 - c * 0.072 - s * 0.283,
    0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072
  )
  return new THREE.Matrix3().set(
    0.213 + 0.787 * amount, 0.715 - 0.715 * amount, 0.072 - 0.072 * amount,
    0.213 - 0.213 * amount, 0.715 + 0.285 * amount, 0.072 - 0.072 * amount,
    0.213 - 0.213 * amount, 0.715 - 0.715 * amount, 0.072 + 0.928 * amount
  ).multiply(rotated)
}
