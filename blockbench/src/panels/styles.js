export const STYLES = `
  .mtg-sections {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .mtg-tabs {
    display: flex;
    flex: none;
    border-bottom: 1px solid var(--color-border);
  }

  .mtg-tab {
    display: flex;
    flex: 1 1 0;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    min-width: 0;
    padding: 10px 0 9px;
    font-size: 0.8em;
    line-height: 1.25;
    color: var(--color-subtle_text);
    cursor: pointer;
    user-select: none;
  }

  .mtg-tab > i {
    font-size: 20px;
  }

  .mtg-tab:hover {
    color: var(--color-text);
  }

  .mtg-tab.open {
    color: var(--color-accent);
    box-shadow: inset 0 -2px var(--color-accent);
  }

  .mtg-frame {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }

  .preview .mtg-lock {
    right: auto;
    left: 3px;
    user-select: none;
  }

  body.theme_borders .preview .mtg-lock {
    right: auto;
    left: 0;
  }

  .mtg-checker {
    background: var(--color-dark) conic-gradient(var(--color-ui) 25%, transparent 0 50%, var(--color-ui) 0 75%, transparent 0) 0 0 / 16px 16px;
  }

  .mtg-result {
    display: flex;
    justify-content: center;
    padding: 16px;
  }

  .mtg-result > canvas {
    max-width: 100%;
    max-height: 60vh;
    object-fit: contain;
  }

  .mtg-ask {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 10px 16px;
    min-height: 54px;
    padding: 10px 12px;
    border: 1px solid var(--color-button);
  }

  .dialog_content > .mtg-ask {
    margin-bottom: 10px;
  }

  .mtg-ask > p {
    margin: 0;
  }

  .mtg-ask .mtg-button {
    width: auto;
  }

  .mtg-panel {
    flex: 1;
    min-height: 0;
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

  .mtg-radios {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .mtg-radio {
    display: flex;
    flex: 1 1 auto;
    align-items: center;
    gap: 8px;
    padding: 4px 10px;
    white-space: nowrap;
    border: 1px solid var(--color-border);
    cursor: pointer;
    user-select: none;
  }

  .mtg-radio:hover {
    background: var(--color-button);
  }

  .mtg-radio.selected {
    border-color: var(--color-accent);
  }

  .mtg-radio > input {
    flex: none;
    margin: 0;
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

  .mtg-button > i {
    margin: 0;
  }

  .mtg-button:hover {
    background: var(--color-accent);
    color: var(--color-accent_text);
  }

  .mtg-button.primary {
    background: var(--color-accent);
    color: var(--color-accent_text);
  }

  .mtg-button.primary:hover {
    filter: brightness(1.15);
  }

  .mtg-button.voted,
  .mtg-button.voted:hover {
    color: var(--color-confirm);
    background: color-mix(in srgb, var(--color-confirm) 14%, transparent);
    box-shadow: inset 0 0 0 1px var(--color-confirm);
  }

  .mtg-button.voted.negative,
  .mtg-button.voted.negative:hover {
    color: var(--color-error);
    background: color-mix(in srgb, var(--color-error) 14%, transparent);
    box-shadow: inset 0 0 0 1px var(--color-error);
  }

  .mtg-button.mtg-danger:hover {
    color: #ffffff;
    background: var(--color-error);
  }

  .mtg-button.big {
    height: 44px;
    font-size: 1.1em;
    font-weight: 600;
  }

  .mtg-button:disabled,
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

  .mtg-tile:has(> .mtg-badge) > .mtg-name {
    padding: 0 14px;
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
    pointer-events: none;
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

  .mtg-group .form_inline_select > li {
    padding-inline: 4px;
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
    position: relative;
    width: 100%;
  }

  .mtg-placement > img.dim {
    opacity: 0.2;
  }
`
