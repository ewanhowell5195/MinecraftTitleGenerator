export const strip = {
  id: "strip",
  label: "Strip",
  noun: "strip",
  available: false,
  accept: "image/png",
  derived: [],
  async check() {
    return { problems: { file: "Strips can't be submitted yet." }, target: "", details: {} }
  }
}
