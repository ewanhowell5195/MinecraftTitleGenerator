<script setup>
  defineProps({
    title: { type: String, required: true },
    updated: { type: String, required: true },
    about: { type: String, required: true }
  })
</script>

<template>
  <main class="legal wrap">
    <h1 class="page-title">{{ title }}</h1>
    <p class="updated">Last updated: {{ updated }}</p>
    <slot></slot>

    <h2>Contact</h2>
    <p>If you have any questions about {{ about }}, you can contact me:</p>
    <ul>
      <li>On Discord: <a href="https://discord.ewanhowell.com/" target="_blank" rel="noopener">Ewan's Server</a></li>
      <li>By email: <a href="mailto:contact@ewanhowell.com">contact@ewanhowell.com</a></li>
      <li>On GitHub: <a href="https://github.com/ewanhowell5195/MinecraftTitleGenerator/issues" target="_blank" rel="noopener">Open an issue</a></li>
    </ul>
  </main>
</template>
