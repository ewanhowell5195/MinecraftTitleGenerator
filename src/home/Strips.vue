<script setup>
  import { shallowRef } from "vue"
  import FluidMarquee from "fluid-marquee-vue"

  const FOLDER = "/font/minecraft-ten"
  const LISTS = [FOLDER, "/strips/minecraft-ten"]

  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches
  const names = shallowRef([])

  async function loadList(folder) {
    const response = await fetch(`${folder}/textures.json`)
    if (!response.ok) throw new Error(`failed to load ${folder}/textures.json`)
    return (await response.json()).textures
  }

  async function loadNames() {
    const lists = await Promise.all(LISTS.map(loadList))
    const all = Array.from(new Set(lists.flatMap(textures => Object.entries(textures).flatMap(([id, { variants }]) => [id].concat(Object.keys(variants ?? {}))))))
    names.value = all.map((name, index) => [(index * 2654435761) % 2 ** 32, name]).sort((a, b) => a[0] - b[0]).map(entry => entry[1])
  }

  loadNames()
</script>

<template>
  <FluidMarquee v-if="names.length" class="strip" infinite draggable :speed="32" :paused="reduced">
    <img v-for="name of names" :key="name" class="fluid-marquee-item" :src="`${FOLDER}/thumbnails/${name}.png`" alt="" width="96" height="44">
  </FluidMarquee>
</template>

<style scoped>
  .strip .fluid-marquee-item {
    width: auto;
    max-width: none;
    height: 72px;
    padding: 0 14px;
    image-rendering: pixelated;
  }

  @media (max-width: 600px) {
    .strip .fluid-marquee-item {
      height: 56px;
      padding: 0 10px;
    }
  }
</style>
