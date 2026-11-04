export function titleCase(id) {
  return id.replace(/_|-/g, " ").replace(/\w\S*/g, word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
}
