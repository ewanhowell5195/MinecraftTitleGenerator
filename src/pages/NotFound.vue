<template>
  <main class="legal wrap missing">
    <h1>Page not found</h1>
    <p>There's nothing at this address. It may have moved, or the link may be wrong.</p>
    <div class="links">
      <RouterLink class="button" to="/">Go to the home page</RouterLink>
      <RouterLink class="button dark" to="/app/">Open the generator</RouterLink>
    </div>
  </main>
</template>

<style scoped>
  .missing {
    min-height: 70vh;
  }

  .links {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    margin-top: 28px;
  }
</style>
