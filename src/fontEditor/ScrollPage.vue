<script setup>
  import SiteFooter from "../site/SiteFooter.vue"
</script>

<template>
  <div class="scroll-page">
    <div class="scroll-content">
      <slot></slot>
    </div>
    <SiteFooter />
  </div>
</template>

<style scoped>
  .scroll-page {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow-y: auto;
  }

  .scroll-content {
    flex: none;
    min-height: 100%;
    padding: 28px 16px 40px;
  }
</style>
