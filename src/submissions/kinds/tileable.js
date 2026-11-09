export const tileable = {
  image: false,
  line() {
    throw new Error("tileable submissions can't be opened in the generator yet")
  },
  summary() {
    return ""
  },
  rows() {
    return []
  }
}
