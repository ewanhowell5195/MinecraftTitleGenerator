import { clamp } from "../core/maths.js"

const SPAN = 1000

export function nearestStep(steps, number) {
  return steps.reduce((best, step, index) => Math.abs(step - number) < Math.abs(steps[best] - number) ? index : best, 0)
}

export function sliderRange({ min, max, step, steps, log }) {
  if (log) return { min: 0, max: SPAN, step: 1 }
  return steps ? { min: 0, max: steps.length - 1, step: 1 } : { min, max, step }
}

export function sliderPosition({ min, max, steps, log }, value) {
  if (log) return clamp(Math.round(Math.log(value / min) / Math.log(max / min) * SPAN), 0, SPAN)
  return steps ? nearestStep(steps, value) : value
}

export function sliderValue({ min, max, step, steps, log }, at) {
  if (log) return Math.round(min * (max / min) ** (at / SPAN) / step) * step
  return steps ? steps[at] : at
}

export function sliderFill(slider, value) {
  const range = sliderRange(slider)
  const percent = number => clamp((number - range.min) / (range.max - range.min) * 100, 0, 100)
  if (slider.log || slider.steps) return { "--from": "0%", "--to": `${percent(sliderPosition(slider, value))}%` }
  const { min, max, step } = slider
  const origin = percent(clamp(0, min, max))
  const current = percent(clamp(min + Math.round((value - min) / step) * step, min, max))
  return { "--from": `${Math.min(origin, current)}%`, "--to": `${Math.max(origin, current)}%` }
}
