export function followDrag(move, end) {
  function finish() {
    removeEventListener("pointermove", move)
    removeEventListener("pointerup", finish)
    end()
  }
  addEventListener("pointermove", move)
  addEventListener("pointerup", finish)
}

function middle(row) {
  const { top, height } = row.getBoundingClientRect()
  return top + height / 2
}

export function sortRows(event, rows, from, { move, end }) {
  if (event.button !== 0) return
  event.preventDefault()
  let at = from
  followDrag(({ clientY }) => {
    const to = Array.from(rows.children).filter((row, index) => index !== at && middle(row) < clientY).length
    if (to === at) return
    move(at, to)
    at = to
  }, end)
}
