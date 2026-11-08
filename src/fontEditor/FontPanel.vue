<script setup>
  import { computed, onMounted, ref, shallowRef } from "vue"
  import Icon from "../components/Icon.vue"
  import { loadFontList } from "../lib/font.js"
  import { DEFAULT_BORDER, DEFAULT_DEPTH, DEFAULT_SPACE_WIDTH, autoStretch, lostPixels, resizeFont, setSquareSize, slug, squareSizeLoss, squaresOf } from "../lib/fontEditor.js"
  import { font, update } from "./store.js"

  const FLAGS = [
    { key: "terminatorSpace", label: "Space beside terminators", hint: "Leaves a gap between the ┫ ┣ end pieces and the text." },
    { key: "forcedTerminators", label: "Always use terminators", hint: "Every line gets the ┫ ┣ end pieces, and the option to turn them off is hidden." },
    { key: "autoBorder", label: "Automatic border frame", hint: "Draws a filled frame around the whole line, for outline style fonts." },
    { key: "flat", label: "Flat font", hint: "Update Text won't get its usual 30 extra depth." },
    { key: "overlay", label: "Forced overlay", hint: "Draws an overlay.png over the letters on every texture except premade sheets. This editor doesn't make that file: you add it to the font's folder yourself, on the same layout as the font's flat.png." }
  ]

  const SPACING = [
    { key: "spaceWidth", label: "Space width", min: 0, fallback: DEFAULT_SPACE_WIDTH },
    { key: "characterSpacing", label: "Letter spacing", min: null, fallback: 0 },
    { key: "depth", label: "Depth", min: 0, fallback: DEFAULT_DEPTH },
    { key: "border", label: "Border", min: 0, fallback: DEFAULT_BORDER }
  ]

  const ABOUT = [
    { key: "name", label: "Name", required: true, hint: "Shown in the font list and the credits." },
    { key: "id", label: "ID", required: true, slug: true, hint: "Lowercase letters, numbers and dashes. Made from the name until you change it." },
    { key: "author", label: "Author", required: true, hint: "Who made the font, shown in the credits." },
    { key: "description", label: "Description", required: false, hint: "A short line shown under the font's name in the generator." },
    { key: "basedOn", label: "Based on font", required: false, slug: true, placeholder: "minecraft-ten", hint: "The ID of the font yours was made from, so its author is credited too." }
  ]

  const warning = ref(null)
  const published = shallowRef([])

  const previewId = computed(() => font.value.id || slug(font.value.name) || "my-font")
  const clashes = computed(() => {
    const name = font.value.name.trim().toLowerCase()
    const id = font.value.id || slug(font.value.name)
    const sameName = published.value.find(entry => fullName(entry).toLowerCase() === name)
    const sameId = published.value.find(entry => entry.id === id)
    return {
      name: sameName ? `${fullName(sameName)} already uses this name. Pick another so the two aren't mixed up.` : null,
      id: sameId ? `${fullName(sameId)} already uses this ID, so the generator would treat your font as that one.` : null
    }
  })

  onMounted(async () => {
    published.value = await loadFontList()
  })

  function fullName(entry) {
    const parent = entry.variant && published.value.find(item => item.id === entry.variant)
    return parent ? `${parent.name} ${entry.name}` : entry.name
  }
  const finalSize = computed(() => `${font.value.height * font.value.density} pixels tall and ${font.value.width * font.value.density} wide`)

  function setField(key, value, group = true) {
    update({ ...font.value, [key]: value }, group ? `font.${key}` : null)
  }

  function setText(key, event) {
    const value = event.target.value
    const followsName = key === "name" && (!font.value.id || font.value.id === slug(font.value.name))
    update({ ...font.value, [key]: value, ...(followsName ? { id: slug(value) } : {}) }, `font.${key}`)
  }

  function setNumber(key, event, minimum) {
    const value = event.target.valueAsNumber
    if (Number.isInteger(value) && value >= minimum) setField(key, value)
    else if (event.type === "change") event.target.value = font.value[key]
  }

  function setTerminatorWidth(event) {
    if (event.target.value === "") return setField("terminatorSpaceWidth", null)
    setNumber("terminatorSpaceWidth", event, 0)
  }

  function applyOrWarn(event, shown, lost, text, apply) {
    if (!lost) return apply()
    if (event.type !== "change") return
    event.target.value = shown
    warning.value = { text, lost, apply }
  }

  function setSize(key, event) {
    const value = event.target.valueAsNumber
    const pixels = value * font.value.grid
    const shown = squaresOf(font.value, font.value[key])
    if (!Number.isInteger(pixels) || pixels < 1) {
      if (event.type === "change") event.target.value = shown
      return
    }
    if (pixels === font.value[key]) return
    applyOrWarn(event, shown, lostPixels(font.value, { [key]: pixels }), `Changing ${key === "height" ? "the height" : "the default width"} to ${value}`, () => update(resizeFont(font.value, { [key]: pixels }), `font.${key}`))
  }

  function setSquare(event) {
    const value = event.target.valueAsNumber
    if (!Number.isInteger(value) || value < 1) {
      if (event.type === "change") event.target.value = font.value.grid
      return
    }
    if (value === font.value.grid) return
    applyOrWarn(event, font.value.grid, squareSizeLoss(font.value, value), `Changing the square size to ${value}`, () => update(setSquareSize(font.value, value), "font.grid"))
  }

  function confirmResize() {
    warning.value.apply()
    warning.value = null
  }

  function markAll() {
    update(autoStretch(font.value))
  }
</script>

<template>
  <div class="flow">
    <h3>About</h3>
    <label v-for="item of ABOUT" :key="item.key" class="field">
      <span class="label-row"><span class="label">{{ item.label }}</span><span class="need" :class="{ required: item.required }">{{ item.required ? "Required" : "Optional" }}</span></span>
      <input v-if="item.slug" type="text" :value="font[item.key]" :placeholder="item.key === 'id' ? previewId : item.placeholder" @change="setField(item.key, slug($event.target.value), false)">
      <input v-else type="text" :value="font[item.key]" @input="setText(item.key, $event)">
      <small class="about-hint">{{ item.hint }}</small>
      <small v-if="clashes[item.key]" class="clash">{{ clashes[item.key] }}</small>
    </label>

    <h3>Size</h3>
    <div class="numbers">
      <label class="field"><span class="label">Height</span><input type="number" min="1" :value="squaresOf(font, font.height)" @input="setSize('height', $event)" @change="setSize('height', $event)"></label>
      <label class="field"><span class="label">Default width</span><input type="number" min="1" :value="squaresOf(font, font.width)" @input="setSize('width', $event)" @change="setSize('width', $event)"></label>
      <label class="field"><span class="label">Square size</span><input type="number" min="1" :value="font.grid" @input="setSquare" @change="setSquare"></label>
    </div>
    <p class="hint">Height and width count squares, and one click paints one square. Square size is how many pixels each square is. Each character is {{ finalSize }}.</p>
    <div v-if="warning" class="warning">
      <p>{{ warning.text }} changes {{ warning.lost }} drawn {{ warning.lost === 1 ? "pixel" : "pixels" }}.</p>
      <div class="row">
        <button class="small" @click="warning = null">Cancel</button>
        <button class="small danger" @click="confirmResize">Change anyway</button>
      </div>
    </div>

    <h3>Spacing and shape</h3>
    <div class="numbers">
      <div v-for="item of SPACING" :key="item.key" class="field">
        <span class="label-row">
          <label class="label" :for="`font-${item.key}`">{{ item.label }}</label>
          <button v-if="font[item.key] !== item.fallback" class="icon-button reset" :title="`Reset to ${item.fallback}`" :aria-label="`Reset ${item.label.toLowerCase()} to ${item.fallback}`" @click="setField(item.key, item.fallback, false)"><Icon name="reset" :size="14" /></button>
        </span>
        <input :id="`font-${item.key}`" type="number" :min="item.min" :value="font[item.key]" @input="setNumber(item.key, $event, item.min ?? -1000)" @change="setNumber(item.key, $event, item.min ?? -1000)">
      </div>
    </div>
    <p class="hint">These are in pixels, not squares.</p>

    <h3>Options</h3>
    <template v-for="flag of FLAGS" :key="flag.key">
      <label class="check">
        <input type="checkbox" :checked="font[flag.key]" @change="setField(flag.key, $event.target.checked, false)">
        <span><strong>{{ flag.label }}</strong><small>{{ flag.hint }}</small></span>
      </label>
      <label v-if="flag.key === 'terminatorSpace' && font.terminatorSpace" class="field nested">
        <span class="label">Terminator space width</span>
        <input type="number" min="0" :value="font.defineSpace ? '' : font.terminatorSpaceWidth ?? ''" :placeholder="font.defineSpace ? '' : String(font.spaceWidth)" :disabled="font.defineSpace" @input="setTerminatorWidth" @change="setTerminatorWidth">
        <small class="about-hint">{{ font.defineSpace ? "Your font draws its own space character, which is always used beside the terminators." : `In pixels. Leave empty to use the normal space width of ${font.spaceWidth}.` }}</small>
      </label>
    </template>

    <h3>All characters</h3>
    <button class="small" @click="markAll"><Icon name="wand" :size="14" />Mark every character's stretch zones</button>
  </div>
</template>

<style scoped>
  .numbers {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }

  .numbers input[type="number"] {
    width: 100%;
  }

  .label-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 20px;
  }

  .need {
    font-size: var(--font-xs);
    color: var(--faint);
  }

  .need.required {
    color: var(--accent);
  }

  .about-hint {
    font-size: var(--font-sm);
    line-height: 1.35;
    color: var(--faint);
  }

  .nested {
    margin-left: 23px;
  }

  .clash {
    font-size: var(--font-sm);
    line-height: 1.35;
    color: var(--danger);
  }

  .reset {
    width: 20px;
    height: 20px;
    padding: 0;
  }

  .check {
    display: flex;
    gap: 10px;
    cursor: pointer;
    user-select: none;
  }

  .check input {
    flex: none;
    margin: 3px 0 0;
    accent-color: var(--accent);
  }

  .check span {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .check strong {
    font-size: var(--font-md);
    font-weight: 600;
  }

  .check small {
    font-size: var(--font-sm);
    line-height: 1.35;
    color: var(--faint);
  }

  .warning {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px;
    font-size: var(--font-md);
    background: var(--card);
    border-left: 3px solid var(--danger);
  }

  .warning p {
    margin: 0;
  }

  .danger {
    color: #1d0a08;
    background: var(--danger);
  }

  .danger:hover {
    background: #ffa79f;
  }
</style>
