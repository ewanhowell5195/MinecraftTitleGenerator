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
