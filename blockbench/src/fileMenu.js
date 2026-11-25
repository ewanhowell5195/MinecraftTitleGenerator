const GROUP = "minecraft_title"

let separator = null

export function addToFileMenu(action) {
  MenuBar.menus.file.addAction(action, `#${GROUP}`)
}

export function removeFromFileMenu(action) {
  MenuBar.menus.file.removeAction(action)
  action.delete()
}

export function registerFileMenu() {
  separator = new MenuSeparator(GROUP)
  MenuBar.menus.file.addAction(separator, "#import_export")
}

export function unregisterFileMenu() {
  MenuBar.menus.file.removeAction(separator)
}
