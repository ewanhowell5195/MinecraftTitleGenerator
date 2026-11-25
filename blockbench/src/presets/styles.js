export const STYLES = `
  .mtg-screen {
    position: absolute;
    inset: 0 0 calc(-1 * var(--status-bar-height));
    z-index: 10;
    visibility: hidden;
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
    grid-template-columns: minmax(0, 1fr) min(42%, 900px);
  }

  .mtg-browse {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
    min-height: 0;
    padding: 12px 0 0 16px;
    container: mtg-browse / inline-size;
  }

  .mtg-browse > .mtg-row {
    margin-right: 16px;
  }

  .mtg-browse > .mtg-row {
    flex: none;
  }

  .mtg-browse .search_bar {
    margin: 0;
  }

  .mtg-sort {
    flex: none;
    width: 190px;
  }

  .mtg-presets .mtg-random {
    flex: none;
    width: auto;
  }

  .mtg-list {
    flex: 1;
    min-height: 0;
    padding: 0 8px 16px 0;
    overflow-y: auto;
    scrollbar-gutter: stable;
    container-type: inline-size;
  }

  .mtg-preset-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, clamp(260px, 24cqi, 400px)), 1fr));
    gap: 10px;
  }

  .mtg-preset {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
    padding: 8px;
    border: 1px solid transparent;
    background: var(--color-back);
    cursor: pointer;
    user-select: none;
  }

  .mtg-preset:hover {
    background: var(--color-button);
  }

  .mtg-preset.selected {
    border-color: var(--color-accent);
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
    padding: 6px;
    object-fit: contain;
  }

  .mtg-about {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    min-width: 0;
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
    gap: 5px;
    max-width: 100%;
    font-size: 0.9em;
    color: var(--color-subtle_text);
  }

  .mtg-author > i {
    flex: none;
    font-size: 14px;
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

  .mtg-rating {
    display: flex;
    flex: none;
    align-items: center;
    gap: 4px;
    font-variant-numeric: tabular-nums;
  }

  .mtg-rating i {
    font-size: 18px;
    color: #f5c542;
  }

  .mtg-star {
    position: relative;
    display: block;
    width: 18px;
    height: 18px;
  }

  .mtg-star > i {
    position: absolute;
    top: 0;
    left: 0;
    overflow: hidden;
    max-width: none;
  }

  .mtg-star > i:first-child {
    color: var(--color-button);
  }

  .mtg-detail {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-width: 0;
    min-height: 0;
    padding: 12px 16px 16px;
    overflow-y: auto;
    border-left: 1px solid var(--color-border);
  }

  .mtg-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .mtg-actions > .mtg-button {
    flex: 1 1 auto;
    width: auto;
    white-space: nowrap;
  }

  .mtg-detail > * {
    flex: none;
  }

  .mtg-detail > .mtg-picture {
    background: var(--color-back);
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

  .mtg-detail > h2 {
    margin: 0;
    overflow-wrap: anywhere;
  }

  .mtg-facts {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .mtg-by {
    display: flex;
    align-items: center;
    gap: 5px;
  }

  @container mtg-browse (max-width: 560px) {
    .mtg-browse > .mtg-row {
      flex-wrap: wrap;
    }

    .mtg-browse > .mtg-row > .search_bar {
      flex: 1 0 100%;
    }

    .mtg-sort {
      flex: 1;
      width: auto;
    }
  }

  @container mtg-screen (max-width: 1100px) {
    .mtg-presets.open {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    }
  }

  @container mtg-screen (max-width: 700px) {
    .mtg-presets.open {
      grid-template-columns: minmax(0, 1fr);
    }

    .mtg-browse {
      padding: 8px 0 0 8px;
    }

    .mtg-browse > .mtg-row {
      margin-right: 8px;
    }

    .mtg-detail {
      position: absolute;
      inset: 0;
      padding: 4px 12px 16px;
      background: var(--color-ui);
      border-left: none;
    }

    .mtg-close {
      display: flex;
    }

    .mtg-actions > .mtg-button {
      flex-basis: 100%;
      height: auto;
      min-height: 40px;
      white-space: normal;
    }
  }
`
