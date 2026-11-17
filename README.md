# [Minecraft Title Generator](https://mctitlegenerator.com)

Make Minecraft styled titles at [mctitlegenerator.com](https://mctitlegenerator.com). Anyone can submit fonts, textures and shapes to the generator, and once accepted they are there for everyone to use.

For the old Blockbench plugin, see the [legacy branch](https://github.com/ewanhowell5195/MinecraftTitleGenerator/tree/legacy).

## Submitting

Submissions are sent from the [submit page](https://mctitlegenerator.com/submit/). Sign in with Discord or GitHub first.

| Kind | What you send | Guide |
| --- | --- | --- |
| Texture | A PNG, as a texture, overlay, strip or tileable | [Textures](docs/textures.md) |
| Font | The JSON downloaded from the [font editor](https://mctitlegenerator.com/font-editor/) | [Fonts](docs/fonts.md) |
| Shape | A PNG, or a Java block model and its texture | [Shapes](docs/shapes.md) |

The form checks everything as you fill it in, and shows a preview of what you are sending.

### After sending

Sending a submission opens a pull request on this repo. GitHub then builds its thumbnails and a preview of the site with it added, which takes a minute or two. Your [submissions page](https://mctitlegenerator.com/submissions/) links to everything.

Until it is reviewed, you can:

- Edit it. Fonts open straight back up in the font editor.
- Talk to the reviewers in its comments, which are copied to the pull request.
- Withdraw it.

A reviewer then merges or declines it, and you get an email either way. Once merged, it is in the generator.

### Rules

- Only submit your own work, or work you have permission to share.
- Credit everyone who worked on it. If you are porting someone else's work with their permission, credit both yourself and them.
- A font made from someone else's files needs links to the original and to its licence. Fonts are the only kind that can be.
- Nothing offensive or illegal, and no spamming submissions.
- Not every submission is accepted.

The full rules are in the [terms](https://mctitlegenerator.com/terms/), and [LICENSE.md](LICENSE.md) covers who owns what.

## Submitting with a pull request

You can also add things by hand with a pull request. The same rules apply.

1. Fork this repo and clone it.
2. Install [Node.js](https://nodejs.org/), then run `npm i` in the repo.
3. Add your files and their JSON entries. Each guide above describes how its files are stored.

   | Folder | Holds |
   | --- | --- |
   | `public/fonts` | [Fonts](docs/fonts.md), each with its own [textures and overlays](docs/textures.md) |
   | `public/strips` | Shared [strip types](docs/textures.md#strip-types) |
   | `public/tileables` | [Tileables](docs/textures.md#tileable) |
   | `public/shapes` | [Shapes](docs/shapes.md) |

4. Make the thumbnails for every font or shape your change shows up in. A strip type's strips show up in every font that uses it.

   ```bash
   npm run thumbnails -- <font or shape>
   ```

5. Compress the new PNGs.

   ```bash
   npm run compress
   ```

6. Open a pull request, saying what you are adding and who made it.

Thumbnails are always generated, never made by hand.
