export const STYLES = `
  .panel_container[panel_id="minecraft_title_words"] .panel_handle {
    min-width: 0;
    padding: 0 6px;
    font-size: 1em;
  }

  .panel_container[panel_id="minecraft_title_words"] .panel_handle > .panel_menu_button {
    flex-shrink: 0;
    margin-right: -6px;
  }

  .panel_container[panel_id="transform"] > #panel_minecraft_title_form {
    height: 60vh;
  }

  .mtg-panel {
    height: 100%;
    overflow-y: auto;
    container-type: size;
  }

  .mtg-group {
    padding: 8px 12px 12px;
  }

  .mtg-group + .mtg-group {
    border-top: 1px solid var(--color-border);
  }

  .mtg-head {
    display: flex;
    align-items: center;
    height: 30px;
  }

  .mtg-group h3 {
    flex: 1;
    margin: 0;
    font-size: 1.05em;
    color: var(--color-text);
  }

  .mtg-group h4 {
    margin: 6px 0 0;
    font-size: 1em;
    color: var(--color-subtle_text);
  }

  .mtg-head > .tool {
    cursor: pointer;
  }

  .mtg-controls {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .mtg-controls.mtg-row,
  .mtg-row {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 8px;
  }

  .mtg-word > .tool,
  .mtg-space {
    flex: none;
    width: 30px;
    user-select: none;
  }

  .mtg-word > .tool {
    cursor: pointer;
  }

  .mtg-text.mtg-chosen {
    border-color: var(--color-accent);
  }

  .mtg-fill {
    flex: 1;
    min-width: 0;
  }

  .mtg-hint {
    margin: 0;
    color: var(--color-subtle_text);
  }

  .mtg-slider {
    display: grid;
    grid-template-columns: 1fr 64px;
    align-items: center;
    column-gap: 8px;
  }

  .mtg-slider > input[type=number] {
    width: 64px;
    text-align: right;
  }

  .mtg-slider > input[type=range] {
    grid-column: 1 / -1;
    width: 100%;
    height: 22px;
    margin: 0;
  }

  .mtg-slider > input[type=range]::-webkit-slider-runnable-track {
    background: linear-gradient(to right, var(--color-button) var(--from), var(--color-accent) var(--from), var(--color-accent) var(--to), var(--color-button) var(--to));
  }

  .mtg-none {
    padding: 12px;
  }

  .mtg-error {
    margin: 0;
    color: var(--color-error);
  }

  .mtg-field {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .mtg-field > .bb-select,
  .mtg-field > input {
    width: 100%;
    max-width: none;
    margin: 0;
  }

  .mtg-controls .search_bar {
    width: 100%;
    margin: 0;
  }

  .mtg-button {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    width: 100%;
    height: 32px;
    min-width: 0;
    margin: 0;
    padding: 0 10px;
    background: var(--color-button);
    cursor: pointer;
    user-select: none;
  }

  .mtg-button:hover {
    background: var(--color-accent);
    color: var(--color-accent_text);
  }

  .mtg-button.disabled {
    opacity: 0.5;
    pointer-events: none;
  }

  .mtg-button > input {
    display: none;
  }

  .mtg-upload {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 10px;
    background: var(--color-back);
  }

  .mtg-upload > img {
    max-width: 100%;
    max-height: 120px;
    object-fit: contain;
    image-rendering: pixelated;
  }

  .mtg-upload > .mtg-row {
    width: 100%;
  }

  .mtg-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 6px;
  }

  .mtg-scroll {
    margin-right: -10px;
    scrollbar-gutter: stable;
    overflow-y: auto;
  }

  .mtg-short {
    max-height: 360px;
  }

  .mtg-pick {
    /* 50px is a group's 30px header and its padding */
    max-height: max(520px, calc(100cqh - 50px));
    container-type: inline-size;
  }

  .mtg-pick.mtg-peek {
    max-height: max(420px, calc(100cqh - 50px - 120px));
  }

  .mtg-pick > * {
    flex: none;
  }

  .mtg-pick > .mtg-scroll,
  .mtg-pick > .mtg-controls:has(> .mtg-scroll) {
    flex: 0 1 auto;
    align-content: start;
    min-height: 0;
  }

  .mtg-pick > .mtg-scroll {
    --thumb-ratio: 132 / 288;
    --row: calc(((100cqw - 12px) / 3 - 18px) * var(--thumb-ratio) + 39px);
  }

  .mtg-pick > .mtg-patterns {
    --thumb-ratio: 1 / 2;
  }

  .mtg-pick > .mtg-variants {
    --shown: min(var(--rows), 3);
    flex: 0 1000 auto;
    min-height: calc(var(--shown) * var(--row) + (var(--shown) - 1) * 6px);
  }

  .mtg-pick > .mtg-kept {
    min-height: calc(var(--least) * var(--row) + (var(--least) - 1) * 6px);
  }

  .mtg-thumb {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    overflow: hidden;
  }

  .mtg-thumb.pattern {
    background-size: auto 100%;
    image-rendering: pixelated;
  }

  .mtg-thumb img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    image-rendering: pixelated;
  }

  .mtg-name {
    max-width: 100%;
    font-size: 0.85em;
    line-height: 1.25;
    text-align: center;
    overflow-wrap: anywhere;
  }

  .mtg-badge {
    position: absolute;
    right: 4px;
    bottom: 4px;
    min-width: 18px;
    padding: 0 4px;
    font-size: 0.8em;
    line-height: 18px;
    text-align: center;
    background: var(--color-button);
  }

  .mtg-sample {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    font-size: 22px;
    line-height: 1;
    white-space: nowrap;
    color: #ffffff;
    -webkit-text-stroke: 0.1em #000000;
    paint-order: stroke fill;
  }

  .mtg-more {
    height: 1px;
  }

  .mtg-progress {
    height: 6px;
    background: var(--color-back);
  }

  .mtg-progress > div {
    height: 100%;
    background: var(--color-accent);
  }

  .mtg-rows {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .mtg-grip {
    flex: none;
    font-size: 18px;
    color: var(--color-subtle_text);
    cursor: grab;
    user-select: none;
    touch-action: none;
  }

  .mtg-number {
    flex: none;
    width: 56px;
    text-align: right;
  }

  .mtg-controls .tool {
    flex: none;
    cursor: pointer;
  }

  .mtg-controls .tool.disabled {
    opacity: 0.4;
  }

  .mtg-controls > .mtg-slider .tool {
    flex: initial;
  }

  .mtg-layer {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 3px 4px;
    border: 1px solid transparent;
    background: var(--color-back);
    cursor: pointer;
    user-select: none;
  }

  .mtg-layer.selected {
    border-color: var(--color-accent);
  }

  .mtg-layer.off > img,
  .mtg-layer.off > span {
    opacity: 0.4;
  }

  .mtg-layer > img {
    flex: none;
    width: 44px;
    height: 22px;
    object-fit: contain;
    image-rendering: pixelated;
  }

  .mtg-layer > span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .mtg-colours {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .mtg-gradient {
    display: flex;
    flex-direction: column;
  }

  .mtg-gradient-bar {
    height: 28px;
    margin: 0 7px;
  }

  .mtg-gradient-track {
    position: relative;
    height: 26px;
    margin: 0 7px;
    cursor: copy;
    touch-action: none;
    user-select: none;
  }

  .mtg-stop {
    position: absolute;
    top: 0;
    width: 14px;
    height: 20px;
    margin-left: -7px;
    padding: 3px 2px 2px;
    background: var(--color-button);
    clip-path: polygon(50% 0, 100% 6px, 100% 100%, 0 100%, 0 6px);
    cursor: ew-resize;
    touch-action: none;
  }

  .mtg-stop.selected {
    background: var(--color-accent);
  }

  .mtg-stop.removing {
    opacity: 0.3;
  }

  .mtg-stop > span {
    display: block;
    height: 11px;
    margin-top: 4px;
  }

  .mtg-ends {
    display: flex;
    justify-content: space-between;
    margin-bottom: 6px;
    color: var(--color-subtle_text);
  }

  .mtg-toggle {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    cursor: pointer;
    user-select: none;
  }

  .mtg-group .form_inline_select {
    flex-wrap: nowrap;
  }

  .mtg-group .form_inline_select > li {
    padding-inline: 4px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    user-select: none;
  }

  .mtg-text {
    width: 100%;
    height: 34px;
    padding: 0 10px;
    font-size: 1.1em;
  }

  .mtg-colour .tool.widget {
    width: 64px;
    margin: 0;
  }

  .mtg-fill .bb-select {
    width: 100%;
    max-width: none;
    margin: 0;
  }

  .mtg-row > .mtg-fill {
    width: 100%;
  }

  .mtg-tiles {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .mtg-tile {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 8px;
    border: 1px solid transparent;
    background: var(--color-back);
    cursor: pointer;
    user-select: none;
  }

  .mtg-tile:hover {
    background: var(--color-button);
  }

  .mtg-tile.selected {
    border-color: var(--color-accent);
  }

  .mtg-placement {
    display: grid;
    width: 100%;
    max-width: 220px;
  }

  .mtg-placement > img {
    grid-area: 1 / 1;
    width: 100%;
  }

  .mtg-placement > img.dim {
    opacity: 0.2;
  }
`
