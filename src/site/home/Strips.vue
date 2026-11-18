<script setup>
  import { onMounted, ref } from "vue"
  import FluidMarquee from "fluid-marquee-vue"
  import names from "virtual:strip-names"

  const FOLDER = "/fonts/minecraft-ten"
  const SERVER = import.meta.env.SSR

  const reduced = ref(false)

  onMounted(() => {
    reduced.value = matchMedia("(prefers-reduced-motion: reduce)").matches
  })
</script>

<template>
  <div v-if="SERVER" class="strip still">
    <img v-for="name of names.slice(0, 16)" :key="name" class="fluid-marquee-item" :src="`${FOLDER}/thumbnails/${name}.png`" alt="" width="96" height="44">
  </div>
  <FluidMarquee v-else class="strip" infinite draggable :speed="32" :paused="reduced">
    <img v-for="name of names" :key="name" class="fluid-marquee-item" :src="`${FOLDER}/thumbnails/${name}.png`" alt="" width="96" height="44">
  </FluidMarquee>
</template>

<style scoped>
  .still {
    display: flex;
    align-items: center;
    overflow: hidden;
  }

  .strip .fluid-marquee-item {
    flex-shrink: 0;
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
