export const strip = {
  image: false,
  line() {
    throw new Error("strip submissions can't be opened in the generator yet")
  },
  summary() {
    return ""
  },
  rows() {
    return []
  }
}
