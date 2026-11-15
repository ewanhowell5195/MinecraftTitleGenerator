<template>
  <a class="brand" href="/" aria-label="Minecraft Title Generator"><img src="/favicon.svg" alt="" width="24" height="24"><span class="ellipsis">Minecraft Title Generator</span></a>
</template>

<style scoped>
  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
    font-family: var(--font-ui);
    color: var(--text);
    text-decoration: none;
    user-select: none;
  }

  .brand img {
    flex: none;
  }

  @media (max-width: 600px) {
    .brand span {
      display: none;
    }
  }
</style>
