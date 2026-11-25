<script setup>
  import { computed, onBeforeUnmount } from "vue"
  import { saveImage, saveSheet } from "#lib/state/imageFiles.js"
  import { useSeen } from "#lib/panels/seen.js"
  import Tile from "#c/Tile.vue"
  import TileGrid from "#c/TileGrid.vue"
  import MinecraftShapeTile from "../MinecraftShapeTile.vue"

  const props = defineProps({
    control: { type: Object, required: true },
    state: { type: Object, required: true }
  })

  const { context, resolved } = props.state
  const { observe, stop } = useSeen()
  const tiles = computed(() => resolved(props.control.items))
  const more = computed(() => resolved(props.control.more))
  const style = computed(() => ({ ...(props.control.least && { "--least": resolved(props.control.least) }), ...(props.control.rows && { "--rows": resolved(props.control.rows) }) }))

  function save({ path, name, sheet }) {
    return sheet ? saveSheet(sheet.font, sheet.kind, sheet.id) : saveImage(path, name)
  }

  function menuOf({ download }) {
    return download ? [{ label: download.label, icon: "download", action: () => save(download) }] : null
  }

  function seen(element, { sample }) {
    if (!sample.shown) observe(element, sample.seen)
  }

  onBeforeUnmount(stop)
</script>

<template>
  <TileGrid :min="resolved(control.min)" :columns="control.columns" :class="{ scroll: control.scroll, short: control.short, kept: resolved(control.kept), variants: control.rows, patterns: control.patterns }" :style="style">
    <template v-for="tile of tiles" :key="tile.key">
      <MinecraftShapeTile v-if="tile.model" v-bind="tile.model" :selected="tile.selected" @pick="tile.pick(context)" />
      <Tile v-else :label="tile.label" :unit="tile.unit" :image="tile.image" :aspect="tile.aspect" :pattern="tile.pattern ? { backgroundImage: `url(${tile.pattern})` } : null" :author="tile.author" :badge="tile.badge" :selected="tile.selected" :faded="tile.faded" :menu="menuOf(tile)" @pick="tile.pick(context)">
        <template v-if="tile.layers" #picture>
          <span class="preview">
            <img v-for="layer of tile.layers" :key="layer.key" :src="layer.image" :class="{ dim: layer.dim }" alt="">
          </span>
        </template>
        <template v-else-if="tile.sample" #picture>
          <span :ref="element => seen(element, tile)" class="sample"><span :class="{ shown: tile.sample.shown }" :style="{ fontFamily: tile.sample.family }">ABC</span></span>
        </template>
      </Tile>
    </template>
    <div v-if="more" :key="more.key" :ref="element => observe(element, more.seen)" class="more"></div>
  </TileGrid>
</template>

<style scoped>
  .short {
    max-height: 360px;
  }

  .preview {
    display: grid;
    width: 100%;
  }

  .preview img {
    grid-area: 1 / 1;
    position: relative;
    width: 100%;
  }

  .preview img.dim {
    opacity: 0.2;
  }

  .sample {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    container-type: size;
    overflow: hidden;
  }

  .sample > span {
    font-size: min(56cqh, 26cqw);
    line-height: 1;
    white-space: nowrap;
    color: #ffffff;
    -webkit-text-stroke: 0.1em #000000;
    paint-order: stroke fill;
    opacity: 0;
    transition: opacity var(--duration);
  }

  .sample > .shown {
    opacity: 1;
  }

  .more {
    grid-column: 1 / -1;
    height: 1px;
  }
</style>
