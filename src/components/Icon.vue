<script setup>
  const PATHS = {
    undo: ["M9 14 4 9l5-5", "M4 9h10.5a5.5 5.5 0 0 1 0 11H11"],
    redo: ["m15 14 5-5-5-5", "M20 9H9.5a5.5 5.5 0 0 0 0 11H13"],
    download: ["M12 3v12", "m7 10 5 5 5-5", "M5 21h14"],
    open: ["M3 19V5h6l2 2h9v3", "M3 19l3-9h16l-3 9z"],
    plus: ["M12 5v14", "M5 12h14"],
    eye: ["M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z", "M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0"],
    hidden: ["M3 3l18 18", "M10.6 5.1A10.4 10.4 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-2.2 3.2", "M6.6 6.6A17 17 0 0 0 2 12s3.6 7 10 7a9.8 9.8 0 0 0 5.4-1.6", "M9.9 9.9a3 3 0 0 0 4.2 4.2"],
    bookmark: ["M6 3h12v18l-6-4.5L6 21z"],
    pencil: ["M4 20l1-4L16 5l3 3L8 19z", "M14 7l3 3"],
    copy: ["M9 9h11v11H9z", "M5 15H4V4h11v1"],
    dice: ["M4 4h16v16H4z", "M8.5 8.5h.01", "M15.5 8.5h.01", "M12 12h.01", "M8.5 15.5h.01", "M15.5 15.5h.01"],
    trash: ["M4 7h16", "M10 11v6", "M14 11v6", "M6 7l1 13h10l1-13", "M9 7V4h6v3"],
    up: ["m6 15 6-6 6 6"],
    down: ["m6 9 6 6 6-6"],
    close: ["M6 6l12 12", "M18 6 6 18"],
    arrowUp: ["M12 20V4", "m5 11 7-7 7 7"],
    arrowDown: ["M12 4v16", "m5 13 7 7 7-7"],
    back: ["M20 12H4", "m10 6-6 6 6 6"],
    info: ["M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0", "M12 11v5", "M12 8h.01"],
    camera: ["M4 8h3l2-3h6l2 3h3v11H4z", "M15 13a3 3 0 1 1-6 0 3 3 0 0 1 6 0"],
    text: ["M5 7V5h14v2", "M12 5v14", "M9 19h6"],
    font: ["m3 19 6-15 6 15", "M5.5 13h7", "M21 19v-5a2.5 2.5 0 0 0-5 0", "M21 16.5h-2.5a2 2 0 0 0 0 4c1.5 0 2.5-1 2.5-2.5"],
    texture: ["M3 5h18v14H3z", "M3 10h18", "M3 15h18", "M9 5v5", "M15 10v5", "M9 15v4"],
    palette: ["M12 3a9 9 0 1 0 0 18c1.1 0 1.5-.8 1.5-1.6 0-.5-.2-.9-.5-1.2-.3-.4-.5-.8-.5-1.2 0-.9.7-1.5 1.5-1.5H16a5 5 0 0 0 5-5c0-4-4-7.5-9-7.5z", "M7.5 12h.01", "M9.5 7.5h.01", "M14.5 7.5h.01"],
    cube: ["M12 3 4 7.5v9L12 21l8-4.5v-9z", "m4 7.5 8 4.5 8-4.5", "M12 12v9"],
    layers: ["m12 3 9 5-9 5-9-5z", "m3 13 9 5 9-5"],
    faces: ["M4 4h16v16H4z", "M4 12 12 4", "M4 20 20 4", "M12 20l8-8"],
    grip: ["M9 6h.01", "M9 12h.01", "M9 18h.01", "M15 6h.01", "M15 12h.01", "M15 18h.01"],
    space: ["M4 10v5h16v-5"],
    pointer: ["M6 3l13 8-6 1.5L10 19z"],
    move: ["M12 3v18", "M3 12h18", "m9 6 3-3 3 3", "m9 18 3 3 3-3", "m6 9-3 3 3 3", "m18 9 3 3-3 3"],
    orbit: ["M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0", "M3 12c0 2.2 4 4 9 4s9-1.8 9-4", "M12 3c-2.2 0-4 4-4 9s1.8 9 4 9"],
    rotate: ["M20 12a8 8 0 1 1-2.3-5.7", "M20 4v5h-5"],
    reset: ["M4 12a8 8 0 1 0 2.3-5.7", "M4 4v5h5"],
    scale: ["M4 14v6h6", "m4 20 7-7", "M14 4h6v6", "m20 4-7 7"],
    link: ["M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7", "M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"],
    share: ["M21 5a3 3 0 1 1-6 0 3 3 0 0 1 6 0", "M9 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0", "M21 19a3 3 0 1 1-6 0 3 3 0 0 1 6 0", "m8.6 13.5 6.8 4", "m15.4 6.5-6.8 4"]
  }

  defineProps({
    name: { type: String, required: true },
    size: { type: Number, default: 16 }
  })
</script>

<template>
  <svg class="icon" :width="size" :height="size" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path v-for="d of PATHS[name]" :key="d" :d="d" />
  </svg>
</template>

<style scoped>
  .icon {
    flex: none;
    display: block;
  }
</style>
