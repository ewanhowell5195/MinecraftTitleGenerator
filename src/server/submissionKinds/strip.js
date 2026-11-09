export const strip = {
  async write() {
    throw new Error("strip submissions aren't supported yet")
  },
  describe() {
    return { where: "", into: "" }
  },
  watches() {
    return []
  }
}
