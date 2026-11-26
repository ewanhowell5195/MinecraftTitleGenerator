import { platform } from "#lib/core/platform.js"
import { startBrowsing } from "./browsing.js"

const LINKS = [
  { text: "Website", path: "/", icon: "language", colour: "#33E38E" },
  { text: "Font Editor", path: "/font-editor/", icon: "brush", colour: "#F0B13D" },
  { text: "Submit Fonts and Textures", path: "/submit/", icon: "upload", colour: "#3E90FF" },
  { text: "Credits", path: "/credits/", icon: "groups", colour: "#E35BB0" },
  { text: "GitHub", path: "https://github.com/ewanhowell5195/MinecraftTitleGenerator", icon: "fab.fa-github", colour: "#8E6BDB" }
]

const TIPS = [
  "Type your text and style it in <strong>Title</strong> mode. Highlight part of a word and press <strong>Add Word</strong> to give it its own texture.",
  "<strong>Presets</strong> mode has ready-made titles shared by the community, and keeps the presets you save.",
  "<strong>Render</strong> mode saves your title as a high quality PNG or SVG.",
  "The lock in the viewport keeps the view at the render angle while you edit."
]

export const STYLES = `
  #format_page_minecraft_title {
    display: flex;
    flex-direction: column;
    padding-bottom: 0;
  }
  .mtg-start {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
  }
  .mtg-start > content {
    overflow-y: auto;
  }
  .mtg-start-links {
    display: flex;
    justify-content: space-around;
    gap: 4px;
    margin-top: auto;
    padding-top: 20px;
  }
  .mtg-start-links > a {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 5px;
    flex: 1 1 0;
    padding: 6px 4px;
    border-radius: 4px;
    color: var(--color-subtle_text);
    text-align: center;
    text-decoration: none;
    cursor: pointer;
    user-select: none;
  }
  .mtg-start-links > a:hover {
    background-color: var(--color-accent);
    color: var(--color-light);
  }
  .mtg-start-links > a > span {
    width: 100%;
  }
  .mtg-start-links > a > span:first-child {
    height: 32px;
  }
  .mtg-start-links i {
    font-size: 32px;
    width: 100%;
    max-width: none;
    height: 32px;
    line-height: 32px;
    text-align: center;
  }
  .mtg-start-links > a:hover i {
    color: var(--color-light) !important;
  }
  .mtg-start-buttons {
    display: flex;
    gap: 8px;
    margin: 20px 0 24px;
  }
  .mtg-start-buttons > button {
    flex: 1 1 0;
    width: auto;
    height: 40px;
    margin: 0;
    user-select: none;
  }
  .mtg-start-buttons > button > i {
    vertical-align: bottom;
    margin-right: 3px;
    margin-bottom: 2px;
  }
`

export function startPage({ create }) {
  return {
    data: () => ({ links: LINKS.map(link => ({ ...link, url: platform.asset(link.path), icon: Blockbench.getIconNode(link.icon, link.colour).outerHTML })), tips: TIPS }),
    methods: {
      create,
      presets: startBrowsing,
      open(url) {
        Blockbench.openLink(url)
      }
    },
    template: `
      <div class="mtg-start">
        <p class="format_description">Make Minecraft styled titles that you can render in high quality.</p>
        <p class="format_target"><b>Target</b>: <span>Logos</span> <span>Renders</span> <span>Thumbnails</span></p>
        <content class="markdown">
          <h3>Good to know</h3>
          <ul>
            <li v-for="tip in tips" v-html="tip"></li>
          </ul>
        </content>
        <div class="mtg-start-links">
          <a v-for="link in links" :key="link.text" :title="link.url" @click="open(link.url)">
            <span v-html="link.icon"></span>
            <span>{{ link.text }}</span>
          </a>
        </div>
        <div class="mtg-start-buttons">
          <button @click="presets"><i class="material-icons">auto_awesome_mosaic</i> Start from a Preset</button>
          <button id="create_new_model_button" @click="create"><i class="material-icons">arrow_forward</i> Create New Title</button>
        </div>
      </div>
    `
  }
}
