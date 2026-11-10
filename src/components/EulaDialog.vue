<script setup>
  import { ref } from "vue"
  import { EULA_URL, answerEula } from "../lib/eula.js"
  import { scene } from "../lib/scene.js"
  import { setTexture } from "../lib/settings.js"
  import Button from "./Button.vue"
  import Checkbox from "./Checkbox.vue"
  import RenderDialog from "./RenderDialog.vue"

  const agreed = ref(false)

  function decline() {
    for (const object of scene.objects) {
      if (object.textureSource === "tileable" && object.tileableSource === "minecraft") setTexture(object, { tileableSource: "premade", tileable: "checkerboard", tileableVariant: null })
    }
    answerEula(false)
  }
</script>

<template>
  <RenderDialog title="Minecraft EULA" close-title="No" @close="decline">
    <div class="dialog-body">
      <p>The Minecraft textures in Tileables are the game's own block textures, downloaded straight from Mojang. To use them, you need to agree to the <a :href="EULA_URL" target="_blank" rel="noopener">Minecraft End User License Agreement (EULA)</a>.</p>
      <p>Choosing No uses the premade checkerboard instead, and Tileables will open on Premade from now on.</p>
      <Checkbox v-model="agreed">I have read the EULA and I agree to its terms</Checkbox>
      <div class="dialog-actions">
        <Button @click="decline">No</Button>
        <Button primary :disabled="!agreed" @click="answerEula(true)">Continue</Button>
      </div>
    </div>
  </RenderDialog>
</template>

<style scoped>
  a {
    color: var(--accent);
  }

  a:hover {
    color: var(--accent-hover);
  }
</style>
