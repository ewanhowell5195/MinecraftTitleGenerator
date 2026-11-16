<template>
  <span class="spinner" aria-hidden="true"></span>
</template>

<style scoped>
  .spinner {
    display: inline-block;
    width: 36px;
    height: 36px;
    border: 4px solid var(--line-strong);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 0.9s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
