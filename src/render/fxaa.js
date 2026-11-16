export const FXAA_VERTEX = `
attribute vec2 position;
varying vec2 place;
void main() {
  place = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}`

export const FXAA_FRAGMENT = `
precision highp float;
uniform sampler2D scene;
uniform vec2 pixel;
varying vec2 place;

float luma(vec2 at) {
  vec4 colour = texture2D(scene, at);
  float light = dot(colour.rgb, vec3(0.299, 0.587, 0.114));
#ifdef LINEAR_INPUT
  light = sqrt(light);
#endif
  return light * 0.7 + colour.a * 0.3;
}

vec4 finished(vec2 at) {
  vec4 colour = texture2D(scene, at);
#ifdef LINEAR_INPUT
  vec3 straight = colour.rgb / max(colour.a, 0.001);
  vec3 low = straight * 12.92;
  vec3 high = 1.055 * pow(straight, vec3(1.0 / 2.4)) - 0.055;
  colour.rgb = mix(low, high, step(0.0031308, straight)) * colour.a;
#endif
  return colour;
}

float stride(int index) {
  if (index < 4) return 1.0;
  if (index < 5) return 1.5;
  if (index < 8) return 2.0;
  return index < 9 ? 4.0 : 8.0;
}

void main() {
  float centre = luma(place);
  float down = luma(place + vec2(0.0, -pixel.y));
  float up = luma(place + vec2(0.0, pixel.y));
  float left = luma(place + vec2(-pixel.x, 0.0));
  float right = luma(place + vec2(pixel.x, 0.0));
  float lowest = min(centre, min(min(down, up), min(left, right)));
  float highest = max(centre, max(max(down, up), max(left, right)));
  float range = highest - lowest;
  if (range < max(0.0312, highest * 0.125)) {
    gl_FragColor = finished(place);
    return;
  }
  float downLeft = luma(place - pixel);
  float upRight = luma(place + pixel);
  float upLeft = luma(place + vec2(-pixel.x, pixel.y));
  float downRight = luma(place + vec2(pixel.x, -pixel.y));
  float leftCorners = downLeft + upLeft;
  float rightCorners = downRight + upRight;
  float across = abs(-2.0 * left + leftCorners) + abs(-2.0 * centre + down + up) * 2.0 + abs(-2.0 * right + rightCorners);
  float along = abs(-2.0 * up + upLeft + upRight) + abs(-2.0 * centre + left + right) * 2.0 + abs(-2.0 * down + downLeft + downRight);
  bool level = across >= along;
  float first = level ? down : left;
  float second = level ? up : right;
  float firstGradient = first - centre;
  float secondGradient = second - centre;
  bool firstSteeper = abs(firstGradient) >= abs(secondGradient);
  float scaled = 0.25 * max(abs(firstGradient), abs(secondGradient));
  float reach = level ? pixel.y : pixel.x;
  float local = 0.5 * (second + centre);
  if (firstSteeper) {
    reach = -reach;
    local = 0.5 * (first + centre);
  }
  vec2 start = place;
  if (level) start.y += reach * 0.5;
  else start.x += reach * 0.5;
  vec2 offset = level ? vec2(pixel.x, 0.0) : vec2(0.0, pixel.y);
  vec2 back = start - offset;
  vec2 ahead = start + offset;
  float backEnd = luma(back) - local;
  float aheadEnd = luma(ahead) - local;
  bool backDone = abs(backEnd) >= scaled;
  bool aheadDone = abs(aheadEnd) >= scaled;
  if (!backDone) back -= offset;
  if (!aheadDone) ahead += offset;
  for (int index = 0; index < 10; index++) {
    if (backDone && aheadDone) break;
    if (!backDone) backEnd = luma(back) - local;
    if (!aheadDone) aheadEnd = luma(ahead) - local;
    backDone = abs(backEnd) >= scaled;
    aheadDone = abs(aheadEnd) >= scaled;
    if (!backDone) back -= offset * stride(index);
    if (!aheadDone) ahead += offset * stride(index);
  }
  float backDistance = level ? place.x - back.x : place.y - back.y;
  float aheadDistance = level ? ahead.x - place.x : ahead.y - place.y;
  bool backNearer = backDistance < aheadDistance;
  float span = backDistance + aheadDistance;
  float shift = 0.5 - min(backDistance, aheadDistance) / span;
  bool centreSmaller = centre < local;
  bool correct = ((backNearer ? backEnd : aheadEnd) < 0.0) != centreSmaller;
  float average = (2.0 * (down + up + left + right) + leftCorners + rightCorners) / 12.0;
  float blend = clamp(abs(average - centre) / range, 0.0, 1.0);
  blend = (3.0 - 2.0 * blend) * blend * blend;
  float amount = max(correct ? shift : 0.0, blend * blend * 0.5);
  vec2 target = place;
  if (level) target.y += amount * reach;
  else target.x += amount * reach;
  gl_FragColor = finished(target);
}`
