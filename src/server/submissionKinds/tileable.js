export const tileable = {
  async write() {
    throw new Error("tileable submissions aren't supported yet")
  },
  describe() {
    return { where: "", into: "" }
  },
  watches() {
    return []
  }
}
