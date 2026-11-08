const STATS = "https://api.wynem.com/minecrafttitlegenerator/stats"
const ID_FILTER = "id:"

const people = document.querySelector(".people")
const search = document.querySelector(".search")
const field = search.querySelector("input")
const empty = search.querySelector(".empty")

function usage(element, counts) {
  return element.dataset.stats.split(" ").filter(Boolean).reduce((total, id) => total + (counts.get(id) ?? 0), 0)
}

function byUsage(elements, score) {
  return elements.map((element, index) => ({ element, index, score: score(element) })).sort((a, b) => b.score - a.score || a.index - b.index).map(item => item.element)
}

function matcher(query) {
  if (query.startsWith(ID_FILTER)) {
    const id = query.slice(ID_FILTER.length).trim()
    return piece => piece.dataset.id === id
  }
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  return (piece, person) => {
    const text = `${person} ${piece.querySelector(".name").textContent} ${piece.querySelector(".where").textContent}`.toLowerCase()
    return terms.every(term => text.includes(term))
  }
}

function render() {
  const query = field.value.trim()
  const matches = matcher(query)
  let found = 0
  for (const person of people.querySelectorAll(".person")) {
    const list = person.querySelector(".pieces")
    const pieces = Array.from(list.querySelectorAll(".piece"))
    list.querySelector(".more")?.remove()
    if (query) {
      const name = person.querySelector("h2").textContent
      const shown = pieces.filter(piece => matches(piece, name))
      pieces.forEach(piece => piece.hidden = !shown.includes(piece))
      person.hidden = !shown.length
      found += shown.length
      continue
    }
    person.hidden = false
    found += pieces.length
    const columns = getComputedStyle(list).gridTemplateColumns.split(" ").length
    const shown = person.classList.contains("open") || pieces.length <= columns ? pieces.length : Math.max(1, columns - 1)
    pieces.forEach((piece, index) => piece.hidden = index >= shown)
    if (shown === pieces.length) continue
    const more = document.createElement("li")
    more.className = "more"
    more.innerHTML = `<button type="button"><span class="count">+${pieces.length - shown}</span><span>Show all</span></button>`
    more.querySelector("button").addEventListener("click", () => {
      person.classList.add("open")
      render()
    })
    list.append(more)
  }
  empty.hidden = found > 0
}

function setSearch(value) {
  field.value = value
  const url = new URL(location.href)
  if (value.trim()) url.searchParams.set("search", value.trim())
  else url.searchParams.delete("search")
  history.replaceState(null, "", url)
  render()
}

async function sortByUsage() {
  const response = await fetch(STATS)
  if (!response.ok) throw new Error(`failed to load the title stats: ${response.status}`)
  const counts = new Map((await response.json()).map(entry => [entry.id, entry.count]))
  for (const list of people.querySelectorAll(".pieces")) list.append(...byUsage(Array.from(list.querySelectorAll(".piece")), piece => usage(piece, counts)))
  const total = person => Array.from(person.querySelectorAll(".piece")).reduce((sum, piece) => sum + usage(piece, counts), 0)
  people.append(...byUsage(Array.from(people.querySelectorAll(".person")), total))
  render()
}

search.hidden = false
field.value = new URLSearchParams(location.search).get("search") ?? ""
field.addEventListener("input", () => setSearch(field.value))
people.addEventListener("click", event => {
  const button = event.target.closest(".with")
  if (!button) return
  setSearch(`${ID_FILTER}${button.dataset.id}`)
  search.scrollIntoView({ behavior: "smooth", block: "center" })
})
addEventListener("resize", render)
render()
sortByUsage().catch(err => console.error(err))
