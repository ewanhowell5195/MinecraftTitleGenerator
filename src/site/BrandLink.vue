<script setup>
  import { RouterLink } from "vue-router"

  defineProps({
    to: String
  })
</script>

<template>
  <component :is="to ? RouterLink : 'a'" class="brand" v-bind="to ? { to } : { href: '/' }" aria-label="Minecraft Title Generator"><img src="/favicon.svg" alt="" width="24" height="24"><span>Minecraft Title Generator</span></component>
</template>

<style scoped>
  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
    font-family: var(--font-ui);
    font-size: var(--font-lg);
    font-weight: 600;
    color: var(--text);
    text-decoration: none;
    user-select: none;
  }

  .brand img {
    flex: none;
    translate: 0 7%;
  }

  .brand span {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  @media (max-width: 800px) {
    .brand {
      font-size: var(--font-base);
    }
  }

  @media (max-width: 600px) {
    .brand span {
      display: none;
    }
  }
</style>
