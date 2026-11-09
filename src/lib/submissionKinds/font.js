export const font = {
  id: "font",
  label: "Font",
  noun: "font",
  available: false,
  accept: "application/json",
  derived: [],
  async check() {
    return { problems: { file: "Fonts can't be submitted yet." }, target: "", details: {} }
  }
}
