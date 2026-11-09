export const tileable = {
  id: "tileable",
  label: "Tileable",
  noun: "tileable",
  available: false,
  accept: "image/png",
  derived: [],
  async check() {
    return { problems: { file: "Tileables can't be submitted yet." }, target: "", details: {} }
  }
}
