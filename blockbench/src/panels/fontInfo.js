import { fontCharacters } from "#lib/panels/fontInfo.js"

export function openFontInfo(title, font) {
  new Dialog("minecraft_title_font_info", {
    title,
    width: 640,
    singleButton: true,
    component: {
      data: () => ({ description: font.description ?? null, characters: fontCharacters(font) }),
      template: `
        <div class="mtg-font-info">
          <p v-if="description">{{ description }}</p>
          <h4>Characters</h4>
          <div class="mtg-characters">{{ characters }}</div>
        </div>
      `
    }
  }).show()
}
