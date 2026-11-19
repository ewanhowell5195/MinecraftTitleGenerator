const METADATA = "https://fonts.google.com/metadata/fonts"
const REGULAR = 400

export const GOOGLE_STATS = "google"

function styleOrder(a, b) {
  return parseInt(a) - parseInt(b) || a.length - b.length
}

function regularStyle(styles) {
  const upright = styles.filter(style => !style.endsWith("i"))
  return (upright.length ? upright : styles).sort((a, b) => Math.abs(parseInt(a) - REGULAR) - Math.abs(parseInt(b) - REGULAR))[0]
}

export async function googleCatalog(userAgent) {
  const response = await fetch(METADATA, { headers: { "User-Agent": userAgent } })
  if (!response.ok) throw new Error(`Google Fonts answered ${response.status}`)
  const { familyMetadataList } = await response.json()
  return familyMetadataList.filter(font => font.subsets.includes("latin")).sort((a, b) => a.popularity - b.popularity).map(font => {
    const weight = font.axes.find(axis => axis.tag === "wght")
    return { family: font.family, category: font.category, designers: font.designers, style: regularStyle(Object.keys(font.fonts)), styles: Object.keys(font.fonts).sort(styleOrder), ...(weight && { weights: [weight.min, weight.max] }) }
  })
}
