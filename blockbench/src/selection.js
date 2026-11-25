export function stashSelection() {
  const { uuid } = Project
  const elements = Outliner.selected.slice()
  unselectAllElements()
  return () => {
    if (Project?.uuid !== uuid) return
    for (const element of elements) {
      if (Outliner.elements.includes(element)) element.markAsSelected()
    }
    updateSelection()
  }
}
