export const CENTRE_HINT = "0 is the left end and 100 is the right end."

function amount(key) {
  return { type: "slider", key, label: "Amount", min: -180, max: 180 }
}

function centre(key, shown) {
  return { type: "slider", key, label: "Centre", min: 0, max: 100, hint: CENTRE_HINT, guide: "centre", shown }
}

function hinge(key, label, hint, shown) {
  return { type: "slider", key, label, min: -100, max: 200, hint, guide: "centre", shown }
}

const ribbon = get => !!get("twistRibbon")
const wrap = get => !!get("twistDoor")
const fan = get => !!get("twistFan")

export const TWIST_PANELS = [
  {
    id: "ribbon",
    title: "Ribbon",
    controls: [
      { type: "hint", text: "Tips characters forwards or backwards, more the further they are from the centre." },
      amount("twistRibbon"),
      centre("twistRibbonCentre", ribbon),
      { type: "toggle", key: "twistRibbonMirror", label: "Mirror each side", shown: ribbon }
    ]
  },
  {
    id: "wrap",
    title: "Wrap",
    controls: [
      { type: "hint", text: "Wraps characters round a curve, turning them more the further they are from the centre." },
      amount("twistDoor"),
      centre("twistDoorCentre", wrap),
      { type: "toggle", key: "twistDoorSame", label: "Both sides turn the same way", shown: wrap },
      { type: "toggle", key: "twistDoorRoll", label: "Roll around one shared point", shown: wrap },
      hinge("twistDoorDepth", "Hinge depth", "Where each character hinges on the next. 0 is the back and 100 is the front.", get => wrap(get) && get("twistDoorRoll"))
    ]
  },
  {
    id: "fan",
    title: "Fan",
    controls: [
      { type: "hint", text: "Fans characters out sideways, tilting them more the further they are from the centre." },
      amount("twistFan"),
      centre("twistFanCentre", fan),
      { type: "toggle", key: "twistFanRoll", label: "Fan around one shared point", shown: fan },
      hinge("twistFanHeight", "Hinge height", "Where each character hinges on the next. 0 is the bottom of the line and 100 is the top.", get => fan(get) && get("twistFanRoll"))
    ]
  }
]
