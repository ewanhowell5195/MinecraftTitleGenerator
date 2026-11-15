<script setup>
  import AccountMenu from "./AccountMenu.vue"
  import BrandLink from "./BrandLink.vue"
  import NotificationBell from "./NotificationBell.vue"

  defineProps({
    heading: Boolean,
    title: String,
    site: Boolean
  })
</script>

<template>
  <header class="top-bar" :class="{ site }">
    <slot name="start">
      <component :is="heading ? 'h1' : 'div'" class="top-bar-brand">
        <slot name="brand"><BrandLink /></slot>
      </component>
    </slot>
    <h1 v-if="title" class="top-bar-title" :class="{ divided: !$slots.start }">{{ title }}</h1>
    <slot></slot>
    <div class="top-bar-end">
      <slot name="end"></slot>
      <div class="top-bar-user">
        <AccountMenu />
        <NotificationBell />
      </div>
      <slot name="after"></slot>
    </div>
  </header>
</template>

<style scoped>
  .top-bar {
    --bar-height: 60px;
    --bar-start: 18px;
    --bar-end: 14px;
    --bar-item-padding: 10px;
    display: flex;
    align-items: center;
    gap: 4px;
    min-height: var(--bar-height);
    padding: 0 var(--bar-end) 0 var(--bar-start);
    font-family: var(--font-ui);
    background: var(--surface);
    border-bottom: 1px solid var(--line);
  }

  .top-bar.site {
    --bar-height: 64px;
    --bar-start: max(16px, calc((100% - 1120px) / 2));
    --bar-end: var(--bar-start);
    gap: 28px;
  }

  .top-bar-brand {
    display: flex;
    min-width: 0;
    margin: 0;
  }

  .top-bar-title {
    flex: none;
    margin-block: 0;
    padding: 0 var(--bar-item-padding);
    font-size: var(--font-xl);
    font-weight: 600;
    white-space: nowrap;
  }

  .top-bar-end {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 14px;
  }

  .top-bar-user {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  @media (max-width: 800px) {
    .top-bar {
      --bar-height: 54px;
      --bar-start: 12px;
      --bar-end: 8px;
    }

    .top-bar-title {
      display: none;
    }
  }

  @media (max-width: 600px) {
    .top-bar.site {
      gap: 12px;
    }

    .top-bar-user :deep(.account:not(.signed) span) {
      display: none;
    }
  }
</style>
