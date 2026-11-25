import { onBeforeUnmount, onMounted, ref } from "vue"
import { dropThumbnail, modelThumbnail } from "../minecraft/minecraftModels.js"

export function useModelPicture(props) {
  const tile = ref(null)
  const picture = ref(null)
  let observer = null
  let wanted = false

  function seen(entries) {
    const visible = entries.at(-1).isIntersecting
    if (visible === wanted) return
    wanted = visible
    if (!visible) return dropThumbnail(props.kind, props.id, props.version)
    modelThumbnail(props.kind, props.id, props.version).then(url => {
      picture.value = url
      observer.disconnect()
    }, () => {})
  }

  onMounted(() => {
    observer = new IntersectionObserver(seen)
    observer.observe(tile.value.$el)
  })

  onBeforeUnmount(() => {
    observer?.disconnect()
    if (wanted) dropThumbnail(props.kind, props.id, props.version)
  })

  return { picture, tile }
}
