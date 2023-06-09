# Minecraft Title Generator
This plugin adds a new format that allows you to create Minecraft styled title models that you can render in high quality.

Plugin Homepage: [ewanhowell.com](https://ewanhowell.com/plugins/minecraft-title-generator), [blockbench.net](https://www.blockbench.net/plugins/minecraft_title_generator)

This repo contains the fonts and textures that the plugin uses. To download and use the plugin, go to the plugin store within Blockbench and install it. For more information, go to the plugin homepage.

# Submissions
Anyone can submit fonts and textures to this plugin, as long as they meet the requirements and follow the rules.

### General rules
- Fonts/textures must be of a somewhat high quality. No low effort submissions.
- Fonts/textures must be somewhat unique from other fonts/textures. Try not to re-use other textures too much.
- Full credit must be provided. If you are basing a font/texture off of someone elses design, credit them too!

## How to make a submission
To make a submission, create a fork of this repository and edit/upload the necessary files. After all changes are made, create a pull request and explain what you are adding.

For larger submissions like fonts, it will be a lot easier to clone the repo to your PC and use an app like [GitHub Desktop](https://desktop.github.com/) to manage changes.

### Compiling

After making a subission of either a font or a texture, it would be really helpful if you could compile it. If you dont understand how to do this, you can skip this step and I can do it for you.

#### First time setup:
1. Install [Node.js](https://nodejs.org/)
2. Clone the repo to your PC, add your changes, then navigate to the `scripts` directory in the repo.
3. Open a terminal inside this directory. On Windows this can be done my typing `cmd` into the address bar in file explorer.
4. Run the command `npm i`

#### Compiling:
- If on Windows, just run the `compile.bat` file
- If on MacOS or Linux, run the command `node compile.js`
- Wait until the script finishes

# Textures
1. To create a new texture, start by using another texture as a template. `flat.png` is the best template for general textures.
2. Textures can be found at `fonts/fontname/textures`, and overlays can be found in `fonts/fontname/overlays`.
Save your texture to the either the `textures` or `overlays` folder, depending on what you made.
3. Edit the `textures.json` file located at `fonts/fontname/textures.json` and add your texture to it. This file follows the following formatting:
```js
{
  "textures": { // If you are adding a texture, it goes in here
    "texture_id": { // The ID of the texture you are adding (required)
    "name": "Texture Name", // The name of the texture if it doesn't match the ID (optional)
      "author": "Author Name", // Your name (required)
      "variants": { // The variants for this texture (optional)
      "variant_id": {
      "name": "Variant Name", // (optional)
      "author": "Author Name" // Only needed if different from texture author (optional)
      }
      }
    }
  },
  "overlays": { // If you are adding an overlay, it goes in here
    "overlay_id": { // The ID of the overlay you are adding (required)
      "name": "Overlay Name", // The name of the overlay if it doesn't match the ID (optional)
      "author": "Author Name" // Your name (required)
    }
  }
}
```
<sub>Overlays do not support variants</sub>

Thumbnails are generated through the compile script. Do not make them manually.

### Texture rules
- Textures must use the exact same shapes as the `flat.png` texture. This means no extra cut-outs or filling parts in.
- Textures must be one of these three sizes: `1000x320`, `2000x640`, `4000x1280`
- Do not add too many variants to a single texture. If I feel a variant is unneccesary, or there are two many, it will be denied.
- The border colour at the bottom (under all character lines) must be the same colour for the entire thing. It will not work if you try to use multiple colours.

# Fonts

todo