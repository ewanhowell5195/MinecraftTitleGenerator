<script setup>
  const year = new Date().getFullYear()
</script>

<template>
  <footer class="footer">
    <div class="wrap">
      <div class="footer-top">
        <div class="footer-brand">
          <RouterLink to="/"><img src="/home/logo.webp" alt="Minecraft Title Generator" width="1800" height="524" loading="lazy"></RouterLink>
          <p>Make your own Minecraft style 3D titles, right in your browser!</p>
        </div>
        <nav class="footer-links" aria-label="Footer">
          <div>
            <h2>Make</h2>
            <ul>
              <li><RouterLink to="/app/">Generator</RouterLink></li>
              <li><RouterLink to="/font-editor/">Font editor</RouterLink></li>
              <li><a href="https://ewanhowell.com/plugins/minecraft-title-generator" target="_blank" rel="noopener">Blockbench plugin</a></li>
            </ul>
          </div>
          <div>
            <h2>Community</h2>
            <ul>
              <li><RouterLink to="/app/presets">Presets</RouterLink></li>
              <li><RouterLink to="/submit/">Submit</RouterLink></li>
              <li><RouterLink to="/credits/">Credits</RouterLink></li>
              <li><a href="https://github.com/ewanhowell5195/MinecraftTitleGenerator" target="_blank" rel="noopener">GitHub</a></li>
            </ul>
          </div>
          <div>
            <h2>Legal</h2>
            <ul>
              <li><a href="https://github.com/ewanhowell5195/MinecraftTitleGenerator/blob/main/LICENSE.md" target="_blank" rel="noopener">Licence</a></li>
              <li><RouterLink to="/terms/">Terms of Service</RouterLink></li>
              <li><RouterLink to="/privacy/">Privacy Policy</RouterLink></li>
            </ul>
          </div>
        </nav>
      </div>
      <div class="footer-bottom">
        <p>© 2023-<span class="year">{{ year }}</span> <a href="https://ewanhowell.com" target="_blank" rel="noopener">Ewan Howell</a>, with fonts and textures by <RouterLink to="/credits/">the community</RouterLink>.</p>
        <p>Not an official Minecraft product. Not approved by or associated with Mojang or Microsoft.</p>
      </div>
    </div>
  </footer>
</template>

<style scoped>
  .footer {
    margin-top: var(--footer-gap, clamp(56px, 8vw, 96px));
    padding: 48px 0 32px;
    font-family: var(--font-ui);
    font-size: 15px;
    line-height: 1.55;
    color: var(--muted);
    background: var(--surface);
    border-top: 2px solid var(--line);
  }

  .wrap {
    width: min(1120px, 100% - 32px);
    margin-inline: auto;
  }

  h2,
  p,
  ul {
    margin: 0;
  }

  img {
    display: block;
    max-width: 100%;
    height: auto;
  }

  a {
    color: var(--accent);
  }

  a:hover {
    color: var(--accent-hover);
  }

  .footer-top {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 40px 64px;
  }

  .footer-brand {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .footer-brand a {
    width: 380px;
    max-width: 100%;
    user-select: none;
  }

  .footer-brand p {
    white-space: nowrap;
  }

  .footer-links {
    display: flex;
    flex-wrap: wrap;
    gap: 32px 64px;
  }

  .footer-links h2 {
    margin-bottom: 12px;
    font-family: var(--font-ui);
    font-size: 13px;
    font-weight: 700;
    line-height: 1.1;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--faint);
  }

  .footer-links ul {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 0;
    list-style: none;
  }

  .footer-links a {
    text-decoration: none;
    color: var(--muted);
  }

  .footer-links a:hover {
    color: var(--text);
  }

  .footer-bottom {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 6px 24px;
    margin-top: 40px;
    padding-top: 20px;
    font-size: 14px;
    color: var(--faint);
    border-top: 1px solid var(--line);
  }

  @media (max-width: 600px) {
    .footer-brand p {
      white-space: normal;
    }
  }
</style>
