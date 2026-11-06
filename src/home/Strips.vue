<script setup>
  import { shallowRef } from "vue"
  import FluidMarquee from "fluid-marquee-vue"

  const FOLDER = "/font/minecraft-ten"

  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches
  const names = shallowRef([])

  async function loadNames() {
    const response = await fetch(`${FOLDER}/textures.json`)
    if (!response.ok) throw new Error(`failed to load ${FOLDER}/textures.json`)
    const { textures } = await response.json()
    const all = Object.entries(textures).flatMap(([id, { variants }]) => [id].concat(Object.keys(variants ?? {})))
    names.value = all.map((name, index) => [(index * 2654435761) % 2 ** 32, name]).sort((a, b) => a[0] - b[0]).map(entry => entry[1])
  }

  loadNames()
</script>

<template>
  <FluidMarquee v-if="names.length" class="strip" infinite draggable :speed="32" :paused="reduced">
    <img v-for="name of names" :key="name" class="fluid-marquee-item" :src="`${FOLDER}/thumbnails/${name}.png`" alt="" width="96" height="44">
  </FluidMarquee>
</template>
