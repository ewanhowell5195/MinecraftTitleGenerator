function carriesFiles(event) {
  return Array.from(event.dataTransfer?.types ?? []).includes("Files")
}

function accepts(file, accept) {
  if (!accept) return true
  const name = file.name.toLowerCase()
  return accept.split(",").map(item => item.trim().toLowerCase()).some(item => item.startsWith(".") ? name.endsWith(item) : item.endsWith("/*") ? file.type.startsWith(item.slice(0, -1)) : file.type === item)
}

export function droppedOnField(event) {
  return !!event.target?.closest?.("[data-file-drop]")
}

export const vFileDrop = {
  mounted(element) {
    element.dataset.fileDrop = ""
    let depth = 0

    function input() {
      return element.matches("input[type=file]") ? element : element.querySelector("input[type=file]")
    }

    function enter(event) {
      if (!carriesFiles(event) || input()?.disabled) return
      depth++
      element.classList.add("file-over")
    }

    function leave(event) {
      if (!carriesFiles(event)) return
      depth = Math.max(0, depth - 1)
      if (!depth) element.classList.remove("file-over")
    }

    function over(event) {
      if (carriesFiles(event) && !input()?.disabled) event.preventDefault()
    }

    function drop(event) {
      depth = 0
      element.classList.remove("file-over")
      const target = input()
      if (!carriesFiles(event) || !target || target.disabled || event.fileDropped) return
      event.preventDefault()
      event.fileDropped = true
      const files = Array.from(event.dataTransfer.files).filter(file => accepts(file, target.accept))
      if (!files.length) return
      const transfer = new DataTransfer()
      for (const file of target.multiple ? files : files.slice(0, 1)) transfer.items.add(file)
      target.files = transfer.files
      target.dispatchEvent(new Event("change", { bubbles: true }))
    }

    element.addEventListener("dragenter", enter)
    element.addEventListener("dragleave", leave)
    element.addEventListener("dragover", over)
    element.addEventListener("drop", drop)
  }
}
