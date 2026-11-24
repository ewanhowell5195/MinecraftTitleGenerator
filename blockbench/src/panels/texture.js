import { titleCase } from "../../../src/lib/core/names.js"
import { credit } from "../../../src/lib/font/credits.js"
import { thumbnail, thumbnailHeight } from "../../../src/lib/font/thumbnailUrls.js"
import { ALIGNS, useCustomTexture } from "../../../src/lib/panels/customTexture.js"
import { leastRows, usePickFloor, variantRows } from "../../../src/lib/panels/pickFloor.js"
import { TILEABLE_SOURCES, label, variantBadge } from "../../../src/lib/panels/textureSource.js"
import { tileableUrl } from "../../../src/lib/texture/assets.js"
import { selectedElements } from "../host.js"
import { library } from "../library.js"
import { beginEdit, edit, finishEdit } from "../undo.js"
import { INPUTS } from "./inputs.js"
import { DownloadProgress, VersionControl } from "./minecraft.js"
import { TILES, readImage } from "./tiles.js"

function change(action) {
  edit(selectedElements(), "Change title texture", action)
}

export const TextureSourceBlock = {
  components: { ...INPUTS, ...TILES, DownloadProgress, VersionControl },
  props: { context: Object },
  setup({ context }) {
    const state = context.state

    function thumb(id) {
      return thumbnail(state.font.value, id, state.shownLayer.value)
    }

    function textureCredit(data, parent = null) {
      return credit(data, state.font.value?.id, library.fonts, parent)
    }

    const { picker, floor } = usePickFloor(() => [state.object.value.textureSource, state.usingMinecraft.value, state.textureVariants.value.length, state.tileableVariants.value.length, state.search.value], "mtg-scroll")

    return { ...state, picker, floor, leastRows, variantRows, TILEABLE_SOURCES, library, titleCase, tileableUrl, label, variantBadge, change, thumb, textureCredit, unit: () => thumbnailHeight(state.font.value) }
  },
  template: `
    <div ref="picker" class="mtg-controls" :class="{ 'mtg-pick': object.textureSource === 'premade' || object.textureSource === 'tileable', 'mtg-peek': object.textureSource === 'tileable' }" :style="{ minHeight: floor + 'px' }">
      <segments-control v-if="sources.length > 1" :options="sources" :value="waiting && waiting.textureSource || object.textureSource" @change="change(() => chooseSource($event))" />
      <download-progress v-if="waiting" />

      <template v-if="object.textureSource === 'premade'">
        <search-bar v-if="searchable(textures)" v-model="search" />
        <div v-if="searchingTextures" class="mtg-grid mtg-scroll">
          <title-tile v-for="item of foundTextures" :key="item.id + '/' + (item.variant || '')" :label="item.data.name || titleCase(item.variant || item.id)" :unit="unit()" :image="thumb(item.variant || item.id)" :author="item.variant ? textureCredit(item.data, item.parent) : textureCredit(item.data)" :selected="object.texture === item.id && (object.textureVariant || null) === item.variant" @pick="change(() => pickTexture(item.id, item.variant))" />
        </div>
        <div v-else class="mtg-grid mtg-scroll" :class="{ 'mtg-kept': textureVariants.length }" :style="{ '--least': leastRows(textures) }">
          <title-tile v-for="[id, data] of textures" :key="id" :label="label(id, data)" :unit="unit()" :image="thumb(id)" :author="textureCredit(data)" :badge="variantBadge(data)" :selected="object.texture === id" @pick="change(() => pickTexture(id, null))" />
        </div>
        <template v-if="textureVariants.length && !searchingTextures">
          <h4>Variants</h4>
          <div class="mtg-grid mtg-scroll mtg-variants" :style="{ '--rows': variantRows(textureVariants) }">
            <title-tile :label="list.textures[object.texture].name || titleCase(object.texture)" :unit="unit()" :image="thumb(object.texture)" :selected="!object.textureVariant" @pick="change(() => pickVariant(null))" />
            <title-tile v-for="[id, data] of textureVariants" :key="id" :label="data.name || titleCase(id)" :unit="unit()" :image="thumb(id)" :author="textureCredit(data, list.textures[object.texture])" :selected="object.textureVariant === id" @pick="change(() => pickVariant(id))" />
          </div>
        </template>
      </template>

      <segments-control v-if="object.textureSource === 'tileable'" :options="TILEABLE_SOURCES" :value="waiting && waiting.tileableSource || object.tileableSource" @change="change(() => chooseTileables($event))" />

      <template v-if="usingMinecraft">
        <version-control :version="object.minecraftVersion" @pick="change(() => chooseVersion($event))" />
        <p v-if="blocksError" class="mtg-error">{{ blocksError }}</p>
        <p v-else-if="blocks && !blockEntries.length" class="mtg-hint">This version has no block textures without transparency.</p>
        <template v-if="blockEntries.length">
          <search-bar v-if="searchable(blockEntries)" v-model="search" />
          <div class="mtg-grid mtg-scroll">
            <title-tile v-for="[id, data] of shownBlocks" :key="id" :label="data.name" aspect="2 / 1" :pattern="data.url" :author="data.authors" :selected="object.minecraftTexture === id" @pick="change(() => pickBlock(id))" />
          </div>
        </template>
      </template>

      <template v-if="object.textureSource === 'tileable' && !usingMinecraft">
        <search-bar v-if="searchable(tileables)" v-model="search" />
        <div v-if="searchingTileables" class="mtg-grid mtg-scroll">
          <title-tile v-for="item of foundTileables" :key="item.id + '/' + (item.variant || '')" :label="item.data.name || titleCase(item.variant || item.id)" aspect="2 / 1" :pattern="tileableUrl(library.tileables, item.id, item.variant)" :author="item.data.authors || item.parent.authors" :selected="object.tileable === item.id && (object.tileableVariant || null) === item.variant" @pick="change(() => pickTileable(item.id, item.variant))" />
        </div>
        <div v-else class="mtg-grid mtg-scroll mtg-patterns" :class="{ 'mtg-kept': tileableVariants.length }" :style="{ '--least': leastRows(tileables) }">
          <title-tile v-for="[id, data] of tileables" :key="id" :label="label(id, data)" aspect="2 / 1" :pattern="tileableUrl(library.tileables, id)" :author="data.authors" :badge="variantBadge(data)" :selected="object.tileable === id" @pick="change(() => pickTileable(id, null))" />
        </div>
        <template v-if="tileableVariants.length && !searchingTileables">
          <h4>Variants</h4>
          <div class="mtg-grid mtg-scroll mtg-variants mtg-patterns" :style="{ '--rows': variantRows(tileableVariants) }">
            <title-tile :label="library.tileables[object.tileable].name" aspect="2 / 1" :pattern="tileableUrl(library.tileables, object.tileable)" :selected="!object.tileableVariant" @pick="change(() => pickTileable(object.tileable, null))" />
            <title-tile v-for="[id, data] of tileableVariants" :key="id" :label="data.name" aspect="2 / 1" :pattern="tileableUrl(library.tileables, object.tileable, id)" :author="data.authors || library.tileables[object.tileable].authors" :selected="object.tileableVariant === id" @pick="change(() => pickTileable(object.tileable, id))" />
          </div>
        </template>
      </template>
    </div>
  `
}

export const CustomTextureBlock = {
  components: { ...INPUTS, ...TILES },
  props: { context: Object },
  setup({ context }) {
    const state = useCustomTexture(context)

    function upload(files) {
      readImage(files, data => change(() => state.pickCustom(data)))
    }

    function set(key, value) {
      change(() => (context.object[key] = value))
    }

    function slide(cover, value) {
      beginEdit(selectedElements(), cover)
      state[cover].value = value
    }

    return { ...state, ALIGNS, change, set, slide, upload, done: () => finishEdit("Change title texture") }
  },
  template: `
    <div class="mtg-controls">
      <upload-control accept="image/*" :label="object.customTexture ? 'Replace texture' : 'Choose an image'" empty="No texture uploaded" :image="object.customTexture" :clearable="!!object.customTexture" @files="upload" @clear="set('customTexture', null)" />
      <template v-if="object.customTexture">
        <segments-control label="Use as" :options="modes" :value="object.customTextureMode" @change="set('customTextureMode', $event)" />
        <p :class="object.customTextureMode === 'standard' && !fitsFont ? 'mtg-error' : 'mtg-hint'">{{ modeHint }}</p>
        <toggle-control v-if="object.customTextureMode === 'strip'" label="Restart on each character" hint="Starts the strip again from the left of every character, instead of running it along the whole line." :value="!!object.customStripPerCharacter" @change="set('customStripPerCharacter', $event)" />
        <template v-if="object.customTextureMode === 'cover'">
          <segments-control label="Align to" :options="ALIGNS" :value="object.customCoverAlign" @change="set('customCoverAlign', $event)" />
          <toggle-control v-if="sharing" label="Span with other lines using this image" :value="!!object.customCoverSpan" @change="set('customCoverSpan', $event)" />
          <slider-control v-if="overflow !== 'y' && overflow !== 'none'" label="Horizontal position" :value="coverX" :min="0" :max="100" @change="slide('coverX', $event)" @done="done" />
          <slider-control v-if="overflow !== 'x' && overflow !== 'none'" label="Vertical position" :value="coverY" :min="0" :max="100" @change="slide('coverY', $event)" @done="done" />
        </template>
      </template>
      <p v-else-if="font && font.mesh" class="mtg-hint">An image is tiled across the letters, or you can use it as a strip or stretch it over the line.</p>
      <p v-else class="mtg-hint">An image the shape of this font's flat texture is painted onto the letters. Anything else is tiled, or you can use it as a strip or stretch it over the line.</p>
      <reuse-tiles :items="reusable" @pick="change(() => reuse($event))" />
    </div>
  `
}
