export function useSeen() {
  const watched = new WeakMap()
  let observer = null

  function visible(entries) {
    for (const { isIntersecting, target } of entries) {
      if (!isIntersecting) continue
      observer.unobserve(target)
      watched.get(target)()
    }
  }

  function observe(element, seen) {
    if (!element || watched.has(element)) return
    observer ??= new IntersectionObserver(visible)
    watched.set(element, seen)
    observer.observe(element)
  }

  return { observe, stop: () => observer?.disconnect() }
}
