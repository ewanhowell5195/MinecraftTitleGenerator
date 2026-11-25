export const STYLES = `
  .mtg-screen {
    position: absolute;
    inset: 0 0 calc(-1 * var(--status-bar-height));
    z-index: 10;
    visibility: hidden;
    font-size: 14px;
    line-height: 1.4;
    background: var(--color-ui);
    container: mtg-screen / inline-size;
  }

  body.is_mobile .mtg-screen {
    top: calc(-1 * var(--toolbar-height));
  }

  .mtg-screen.shown {
    visibility: visible;
  }

  .mtg-presets {
    display: grid;
    grid-template: minmax(0, 1fr) / minmax(0, 1fr);
    height: 100%;
  }

  .mtg-presets.open {
    grid-template-columns: minmax(0, 1fr) min(50%, 1024px);
  }

  .mtg-browse {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    container: mtg-browse / inline-size;
  }

  .mtg-tools {
    flex: none;
    padding: 16px 20px;
  }

  .mtg-presets.raised .mtg-tools {
    position: absolute;
    top: calc(-1 * var(--toolbar-height));
    left: 0;
    height: var(--toolbar-height);
    padding: 0 16px 0 20px;
  }

  .mtg-presets.raised .mtg-list,
  .mtg-presets.raised .mtg-detail {
    padding-top: 0;
  }

  .mtg-presets.raised .mtg-tools .mtg-button,
  .mtg-presets.raised .mtg-tools .search_bar,
  .mtg-presets.raised .mtg-tools .search_bar > input,
  .mtg-presets.raised .mtg-tools .bb-select {
    height: 30px;
    font-size: 16px;
    font-weight: 400;
  }

  .mtg-presets.raised .mtg-which {
    font-size: 16px;
  }

  .mtg-presets.raised .mtg-tools .mtg-button > i {
    font-size: 20px;
  }

  .mtg-presets.raised .mtg-tools .search_bar > i {
    margin-top: 3px;
  }

  .mtg-presets.raised .mtg-account > img {
    width: 20px;
    height: 20px;
  }

  .mtg-presets .mtg-button,
  .mtg-presets .search_bar,
  .mtg-presets .search_bar > input,
  .mtg-presets .bb-select {
    height: 36px;
    font-size: 14px;
  }

  .mtg-presets .mtg-button {
    gap: 8px;
    padding: 0 14px;
    font-weight: 600;
  }

  .mtg-presets .mtg-button > i {
    flex: none;
    font-size: 16px;
  }

  .mtg-presets .search_bar {
    margin: 0;
  }

  .mtg-presets .search_bar > input {
    padding: 0 32px 0 12px;
  }

  .mtg-presets .search_bar > i {
    margin-top: 6px;
  }

  .mtg-presets .bb-select {
    display: flex;
    align-items: center;
    padding: 0 24px 0 10px;
  }

  .mtg-presets:not(.raised) .mtg-which li {
    height: 36px;
  }

  .mtg-presets:not(.raised) .bb-select::before {
    top: 6px;
  }

  .mtg-which {
    flex: none;
  }

  .mtg-which .form_inline_select {
    margin: 0;
  }

  .mtg-which .form_inline_select > li {
    display: flex;
    align-items: center;
    justify-content: center;
    padding-inline: 12px;
    white-space: nowrap;
    cursor: pointer;
    user-select: none;
  }

  .mtg-sort {
    flex: none;
    width: 200px;
  }

  .mtg-presets .mtg-account,
  .mtg-presets .mtg-random {
    flex: none;
    width: auto;
  }

  .mtg-title-bar {
    display: flex;
    flex: none;
    align-items: center;
    gap: 5px;
    padding: 0 12px;
    cursor: pointer;
    user-select: none;
  }

  .mtg-title-bar.hidden {
    display: none;
  }

  .mtg-title-bar:hover {
    color: var(--color-light);
  }

  .mtg-title-bar > * {
    cursor: inherit;
  }

  body.is_mobile .mtg-title-bar > span {
    display: none;
  }

  .mtg-account > img {
    flex: none;
    width: 24px;
    height: 24px;
    margin-left: -6px;
  }

  .mtg-account > span {
    max-width: 180px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .mtg-sign-in > p {
    margin: 0;
  }

  .mtg-sign-in > .mtg-code {
    padding: 12px;
    font-size: 1.8em;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-align: center;
    background: var(--color-back);
  }

  .mtg-list {
    flex: 1;
    min-height: 0;
    padding: 0 20px 24px;
    overflow-y: auto;
    container-type: inline-size;
  }

  .mtg-list > p {
    margin: 0 0 12px;
  }

  .mtg-preset-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, clamp(320px, 30cqi, 420px)), 1fr));
    gap: 12px;
  }

  .mtg-preset {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
    padding: 8px;
    border: 1px solid transparent;
    background: var(--color-back);
    cursor: pointer;
    user-select: none;
  }

  .mtg-preset * {
    cursor: inherit;
  }

  .mtg-preset:hover {
    background: color-mix(in srgb, var(--color-back), var(--color-button) 30%);
  }

  .mtg-preset.selected {
    border-color: var(--color-accent);
    background: color-mix(in srgb, var(--color-accent) 14%, var(--color-back));
  }

  .mtg-picture {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    aspect-ratio: 2;
  }

  .mtg-picture > img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    padding: 12px;
    object-fit: contain;
  }

  .mtg-picture > img.waiting {
    visibility: hidden;
  }

  .mtg-about {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    min-width: 0;
    min-height: 38.4px;
  }

  .mtg-about > strong {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .mtg-author {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
    max-width: 100%;
    font-size: 12px;
    color: var(--color-subtle_text);
  }

  .mtg-author > i {
    flex: none;
    font-size: 13px;
  }

  .mtg-author > span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .mtg-link {
    cursor: pointer;
    user-select: none;
  }

  .mtg-link:hover {
    color: var(--color-text);
  }

  .mtg-author.yours {
    color: var(--color-accent);
  }

  .mtg-yours {
    flex: none;
    padding: 1px 6px;
    font-size: 11px;
    font-weight: 600;
    white-space: nowrap;
    color: var(--color-accent);
    background: color-mix(in srgb, var(--color-accent) 14%, transparent);
  }

  .mtg-votes {
    display: flex;
    flex: none;
    gap: 4px;
  }

  .mtg-presets .mtg-votes > .mtg-button {
    width: 28px;
    height: 28px;
    padding: 0;
  }

  .mtg-presets .mtg-votes.named {
    gap: 8px;
  }

  .mtg-presets .mtg-votes.named > .mtg-button {
    flex: 1;
    width: auto;
    height: 36px;
  }

  .mtg-saved + .mtg-saved {
    margin-top: 24px;
  }

  .mtg-saved > h3 {
    margin: 0 0 10px;
    font-family: inherit;
    font-size: 15px;
    font-weight: 600;
    line-height: 1.4;
  }

  .mtg-cut {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .mtg-mark {
    flex: none;
    padding: 1px 6px;
    font-size: 11px;
    font-weight: 600;
    white-space: nowrap;
    color: var(--color-subtle_text);
    background: var(--color-button);
  }

  .mtg-uses {
    display: flex;
    flex: none;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    color: var(--color-subtle_text);
    font-variant-numeric: tabular-nums;
  }

  .mtg-uses > i {
    font-size: 13px;
  }

  .mtg-uses > .mtg-gold {
    color: #f2c14e;
  }

  .mtg-needs {
    flex: none;
    font-size: 12px;
    color: var(--color-subtle_text);
  }

  .mtg-rating {
    display: flex;
    flex: none;
    align-items: center;
    gap: 4px;
    font-size: 15px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  .mtg-rating i {
    font-size: 18px;
    color: #f2c14e;
  }

  .mtg-detail {
    display: flex;
    flex-direction: column;
    gap: 14px;
    min-width: 0;
    min-height: 0;
    padding: 20px 20px 24px;
    overflow-y: auto;
    border-left: 1px solid var(--color-border);
  }

  .mtg-detail > * {
    flex: none;
  }

  .mtg-detail > .mtg-picture {
    max-height: max(180px, 60vh);
  }

  .mtg-detail > .mtg-picture > img {
    padding: 24px;
  }

  .mtg-close {
    display: none;
    justify-content: flex-end;
  }

  .mtg-close > .tool {
    cursor: pointer;
    user-select: none;
  }

  .mtg-heading {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    min-height: 38px;
  }

  .mtg-heading > .tool {
    flex: none;
    cursor: pointer;
    user-select: none;
  }

  .mtg-heading > .mtg-rename {
    flex: 1 1 auto;
    min-width: 0;
    height: 36px;
    padding: 0 10px;
    font-size: 16px;
    font-weight: 600;
  }

  .mtg-heading > h2 {
    min-width: 0;
    margin: 0;
    overflow: hidden;
    font-family: inherit;
    font-size: 18px;
    font-weight: 600;
    line-height: 1.4;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .mtg-detail > .mtg-rating {
    gap: 6px;
    font-size: 13px;
    font-weight: 400;
  }

  .mtg-stars {
    display: flex;
    gap: 1px;
  }

  .mtg-star {
    position: relative;
    display: block;
    width: 16px;
    height: 16px;
  }

  .mtg-star > i {
    position: absolute;
    top: 0;
    left: 0;
    overflow: hidden;
    max-width: none;
    font-size: 16px;
  }

  .mtg-star > i:first-child {
    color: var(--color-button);
  }

  .mtg-detail > p,
  .mtg-facts {
    margin: 0;
    font-size: 13px;
  }

  .mtg-facts {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .mtg-by {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .mtg-by > .mtg-author {
    font-size: 13px;
    font-weight: 700;
  }

  .mtg-by > .mtg-author > i {
    font-size: 14px;
  }

  .mtg-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .mtg-actions > .mtg-button {
    flex: 1 1 260px;
    width: auto;
    white-space: nowrap;
  }

  @container mtg-screen (max-width: 1420px) {
    .mtg-presets.open {
      grid-template-columns: 720px minmax(0, 1fr);
    }
  }

  @container mtg-screen (max-width: 1200px) {
    .mtg-presets.open {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    }
  }

  @container mtg-screen (max-width: 1150px) {
    .mtg-presets.raised .mtg-account > span {
      display: none;
    }

    .mtg-presets.raised .mtg-account > img {
      margin: 0;
    }
  }

  @container mtg-browse (max-width: 820px) {
    .mtg-presets:not(.raised) .mtg-tools {
      flex-wrap: wrap;
    }

    .mtg-presets:not(.raised) .mtg-tools > .search_bar,
    .mtg-presets:not(.raised) .mtg-tools > .mtg-which {
      flex: 1 0 100%;
    }

    .mtg-presets:not(.raised) .mtg-which .form_inline_select > li {
      flex: 1;
    }

    .mtg-presets:not(.raised) .mtg-sort {
      flex: 1;
      width: auto;
      min-width: 0;
    }

    .mtg-presets:not(.raised) .mtg-account > span {
      display: none;
    }

    .mtg-presets:not(.raised) .mtg-account > img {
      margin: 0;
    }
  }

  @container mtg-screen (max-width: 800px) {
    .mtg-presets.open {
      grid-template-columns: minmax(0, 1fr);
    }

    .mtg-tools {
      padding: 12px;
    }

    .mtg-list {
      padding: 0 12px 20px;
    }

    .mtg-detail {
      position: absolute;
      inset: 0;
      padding: 4px 20px 24px;
      background: var(--color-ui);
      border-left: none;
    }

    .mtg-close {
      display: flex;
    }
  }
`
