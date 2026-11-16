# Minecraft Title Generator

The website version of the Minecraft Title Generator, at [mctitlegenerator.com](https://mctitlegenerator.com). It's a Vue 3 and Vite site hosted on Cloudflare Pages, with Pages Functions and a D1 database for accounts, shared presets and submissions.

For the Blockbench plugin's fonts and textures, see the [legacy branch's README](https://github.com/ewanhowell5195/MinecraftTitleGenerator/blob/legacy/README.md).

## Commands

| Command | Does |
| --- | --- |
| `npm run dev` | Starts the Vite dev server |
| `npm run build` | Builds the site into `dist/` |
| `npm test` | Runs the tests in `test/` and the renderer parity test |
| `npm run thumbnails -- [font]` | Regenerates the thumbnails for one font, or for everything when no font is given |
| `npm run compress` | Losslessly compresses changed PNGs under `public/`, recorded in `generator/compressed.json` |
| `npm run convert -- <font file or name>` | Converts a font file or installed font into a font sheet |
| `npm run template -- <font>` | Makes a font's flat template texture |
| `npm run mark -- <font>` | Adds stretch marks to a font's sheet |

The scripts in `generator/` write into `public/` as soon as they run, so only run them on purpose.

## Layout

| Folder | Holds |
| --- | --- |
| `src/site` | The site pages, header, footer and page list |
| `src/app` | The title generator, its panels and the presets pages |
| `src/fontEditor` | The font editor |
| `src/submissions` | The submission form and account pages |
| `src/components` | Components shared across the site |
| `src/render` | The 3D title renderer, title pictures and SVG export |
| `src/lib` | Logic shared by the site, the server, the generator and the renderer, grouped by area |
| `src/server` | Server code for the Pages Functions |
| `src/styles` | Global stylesheets |
| `functions` | Pages Functions routes, each a thin wrapper around `src/server` |
| `generator` | Asset scripts and the submission workflow steps |
| `renderer` | A Node package that renders titles outside the browser |
| `public/fonts` | Fonts, one folder per font with its sheet, textures, overlays and thumbnails. `fonts.json` lists them |
| `public/shapes`, `public/strips`, `public/tileables` | Shapes, strip sets and tileable textures |
| `public/share` | Share images for each page |
| `test` | `node:test` tests |
| `schema.sql` | The D1 schema |

## Environment

The Pages project needs a D1 binding called `DB` using `schema.sql`, and these settings:

| Setting | Used for |
| --- | --- |
| `SESSION_SECRET` | Signing sign-in sessions |
| `IP_SALT` | Hashing IP addresses for share and vote limits |
| `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` | Discord sign-in |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | GitHub sign-in |
| `GITHUB_APP_ID`, `GITHUB_APP_KEY` | The GitHub app that opens submission pull requests |
| `GITHUB_WEBHOOK_SECRET` | Checking GitHub webhooks |
| `RESEND_API_KEY` | Sending emails |
