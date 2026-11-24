<script setup>
  import { tileableUrl } from "../../lib/texture/assets.js"
  import { credit } from "../../lib/font/credits.js"
  import { titleCase } from "../../lib/core/names.js"
  import { thumbnail, thumbnailHeight } from "../../lib/font/thumbnailUrls.js"
  import { TILEABLE_SOURCES, label, variantBadge } from "../../lib/panels/textureSource.js"
  import { library } from "../../lib/state/scene.js"
  import { saveImage } from "../../lib/state/imageFiles.js"
  import { leastRows, usePickFloor, variantRows } from "./pickFloor.js"
  import MinecraftDownload from "../MinecraftDownload.vue"
  import MinecraftVersionField from "../MinecraftVersionField.vue"
  import Notice from "../../components/Notice.vue"
  import Segments from "../../components/Segments.vue"
  import Tile from "../../components/Tile.vue"
  import TileGrid from "../../components/TileGrid.vue"

  const props = defineProps({
    panel: { type: Object, required: true },
    context: { type: Object, required: true }
  })

  const { blockEntries, blocks, blocksError, chooseSource, chooseTileables, chooseVersion, font, foundTextures, foundTileables, list, object, pickBlock, pickTexture, pickTileable, pickVariant, search, searchable, searchingTextures, searchingTileables, shownBlocks, shownLayer, sources, textureVariants, textures, tileableVariants, tileables, usingMinecraft, waiting } = props.context.state
  const { picker, floor } = usePickFloor(() => [object.value.textureSource, usingMinecraft.value, textureVariants.value.length, tileableVariants.value.length, search.value])

  function textureMenu(id, data) {
    return [{ label: "Download texture", icon: "download", action: () => saveImage(`${data.folder ?? font.value.sheetFolder}/textures/${id}.png`, `${id}.png`) }]
  }

  function blockMenu(id, data) {
    return [{ label: "Download texture", icon: "download", action: () => saveImage(data.url, `${id}.png`) }]
  }

  function tileableMenu(id, variant = null) {
    return [{ label: "Download tileable", icon: "download", action: () => saveImage(tileableUrl(library.tileables, id, variant), `${variant ?? id}.png`) }]
  }

  function tilePreview(tileables, id, variant) {
    return { backgroundImage: `url(${tileableUrl(tileables, id, variant)})` }
  }
</script>

<template>
  <div ref="picker" class="flow" :class="{ pick: object.textureSource === 'premade' || object.textureSource === 'tileable', peek: object.textureSource === 'tileable' }" :style="{ minHeight: `${floor}px` }">
    <Segments v-if="sources.length > 1" :options="sources" :model-value="waiting?.textureSource ?? object.textureSource" @update:model-value="chooseSource" />
    <MinecraftDownload v-if="waiting" />

    <template v-if="object.textureSource === 'premade'">
      <input v-if="searchable(textures)" type="text" v-model="search" placeholder="Search textures" aria-label="Search textures">
      <TileGrid v-if="searchingTextures" class="scroll">
        <Tile v-for="item of foundTextures" :key="`${item.id}/${item.variant ?? ''}`" :label="item.data.name ?? titleCase(item.variant ?? item.id)" :unit="thumbnailHeight(font)" :image="thumbnail(font, item.variant ?? item.id, shownLayer)" :author="item.variant ? credit(item.data, font?.id, library.fonts, item.parent) : credit(item.data, font?.id, library.fonts)" :selected="object.texture === item.id && (object.textureVariant ?? null) === item.variant" :menu="textureMenu(item.variant ?? item.id, item.variant ? { ...item.parent, ...item.data } : item.data)" @pick="pickTexture(item.id, item.variant)" />
      </TileGrid>
      <TileGrid v-else class="scroll" :class="{ kept: textureVariants.length }" :style="{ '--least': leastRows(textures) }">
        <Tile v-for="[id, data] of textures" :key="id" :label="label(id, data)" :unit="thumbnailHeight(font)" :image="thumbnail(font, id, shownLayer)" :author="credit(data, font?.id, library.fonts)" :badge="variantBadge(data)" :selected="object.texture === id" :menu="textureMenu(id, data)" @pick="pickTexture(id, null)" />
      </TileGrid>
      <template v-if="textureVariants.length && !searchingTextures">
        <h3>Variants</h3>
        <TileGrid class="scroll variants" :style="{ '--rows': variantRows(textureVariants) }">
          <Tile :label="list.textures[object.texture].name ?? titleCase(object.texture)" :unit="thumbnailHeight(font)" :image="thumbnail(font, object.texture, shownLayer)" :selected="!object.textureVariant" :menu="textureMenu(object.texture, list.textures[object.texture])" @pick="pickVariant(null)" />
          <Tile v-for="[id, data] of textureVariants" :key="id" :label="data.name ?? titleCase(id)" :unit="thumbnailHeight(font)" :image="thumbnail(font, id, shownLayer)" :author="credit(data, font?.id, library.fonts, list.textures[object.texture])" :selected="object.textureVariant === id" :menu="textureMenu(id, { ...list.textures[object.texture], ...data })" @pick="pickVariant(id)" />
        </TileGrid>
      </template>
    </template>

    <Segments v-if="object.textureSource === 'tileable'" :options="TILEABLE_SOURCES" :model-value="waiting?.tileableSource ?? object.tileableSource" @update:model-value="chooseTileables" />

    <template v-if="usingMinecraft">
      <MinecraftVersionField :version="object.minecraftVersion" @pick="chooseVersion" />
      <Notice v-if="blocksError">{{ blocksError }}</Notice>
      <p v-else-if="blocks && !blockEntries.length" class="hint">This version has no block textures without transparency.</p>
      <template v-if="blockEntries.length">
        <input v-if="searchable(blockEntries)" type="text" v-model="search" placeholder="Search textures" aria-label="Search textures">
        <TileGrid class="scroll">
          <Tile v-for="[id, data] of shownBlocks" :key="id" :label="data.name" aspect="2 / 1" :pattern="{ backgroundImage: `url(${data.url})` }" :author="data.authors" :selected="object.minecraftTexture === id" :menu="blockMenu(id, data)" @pick="pickBlock(id)" />
        </TileGrid>
      </template>
    </template>

    <template v-if="object.textureSource === 'tileable' && !usingMinecraft">
      <input v-if="searchable(tileables)" type="text" v-model="search" placeholder="Search textures" aria-label="Search textures">
      <TileGrid v-if="searchingTileables" class="scroll">
        <Tile v-for="item of foundTileables" :key="`${item.id}/${item.variant ?? ''}`" :label="item.data.name ?? titleCase(item.variant ?? item.id)" aspect="2 / 1" :pattern="tilePreview(library.tileables, item.id, item.variant ?? undefined)" :author="item.data.authors ?? item.parent.authors" :selected="object.tileable === item.id && (object.tileableVariant ?? null) === item.variant" :menu="item.variant ? tileableMenu(item.id, item.variant) : tileableMenu(item.id)" @pick="pickTileable(item.id, item.variant)" />
      </TileGrid>
      <TileGrid v-else class="scroll patterns" :class="{ kept: tileableVariants.length }" :style="{ '--least': leastRows(tileables) }">
        <Tile v-for="[id, data] of tileables" :key="id" :label="label(id, data)" aspect="2 / 1" :pattern="tilePreview(library.tileables, id)" :author="data.authors" :badge="variantBadge(data)" :selected="object.tileable === id" :menu="tileableMenu(id)" @pick="pickTileable(id, null)" />
      </TileGrid>
      <template v-if="tileableVariants.length && !searchingTileables">
        <h3>Variants</h3>
        <TileGrid class="scroll variants patterns" :style="{ '--rows': variantRows(tileableVariants) }">
          <Tile :label="library.tileables[object.tileable].name" aspect="2 / 1" :pattern="tilePreview(library.tileables, object.tileable)" :selected="!object.tileableVariant" :menu="tileableMenu(object.tileable)" @pick="pickTileable(object.tileable, null)" />
          <Tile v-for="[id, data] of tileableVariants" :key="id" :label="data.name" aspect="2 / 1" :pattern="tilePreview(library.tileables, object.tileable, id)" :author="data.authors ?? library.tileables[object.tileable].authors" :selected="object.tileableVariant === id" :menu="tileableMenu(object.tileable, id)" @pick="pickTileable(object.tileable, id)" />
        </TileGrid>
      </template>
    </template>
  </div>
</template>
