# Minecraft Title Generator
This plugin adds a new format that allows you to create Minecraft-styled title models that you can render in high quality.

Plugin Homepages: [ewanhowell.com](https://ewanhowell.com/plugins/minecraft-title-generator) and [blockbench.net](https://www.blockbench.net/plugins/minecraft_title_generator)

This repo contains the fonts and textures that the plugin uses. To download and use the plugin, go to the plugin store within Blockbench (`File > Plugins > Available`) and install it. For more information, please see the plugin homepage.

# Submissions
Anyone can submit fonts and textures to this plugin, as long as they meet the requirements and follow the rules.

### General rules
- Fonts/textures must be somewhat high quality. No low-effort submissions.
- Fonts/textures must be somewhat unique from other fonts/textures. Try not to re-use other textures.
- Full credit must be provided. If you are basing a font/texture off of someone else's design, credit them too!
- Font/texture IDs must be in the snake_case format, and only use `a-z`, `0-9`, and underscores.

## How to make a submission
To make a submission, create a fork of this repository and edit/upload the necessary files. After all the changes are made, create a pull request and explain what you are adding.

For larger submissions like fonts, it will be a lot easier to clone the repo to your PC and use an app like [GitHub Desktop](https://desktop.github.com/) to manage changes.

### Compiling
After making a submission of either a font or a texture, it would be really helpful if you could compile it. If you don't understand how to do this, you can skip this step and I can do it for you.

#### First time setup:
1. Install [Node.js](https://nodejs.org/).
2. Clone the repo to your PC, add your changes, and then navigate to the `scripts` directory in the repo.
3. Open a terminal inside this directory. On Windows, this can be done by typing `cmd` into the address bar in file explorer.
4. Run the command `npm i`.

#### Compiling:
- If on Windows, just run the `compile.bat` file.
- If on macOS or Linux, run the command `node compile.js`.
- Wait until the script finishes.

# Textures
## Creating a texture
1. To create a new texture, start by using another texture as a template. `flat.png` is the best template for general textures.
2. Textures can be found at `fonts/fontname/textures`, and overlays can be found in `fonts/fontname/overlays`.
Save your texture to either the `textures` or `overlays` folder, depending on what you made.
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
<sub>Note: Overlays do not support variants</sub>

Thumbnails are generated through the compile script. Do not make them manually.

### Texture rules
- Textures must use the exact same shapes as the `flat.png` texture. This means no extra cut-outs or filling parts in.
- Textures must be one of these three sizes: `1000x320`, `2000x640`, or `4000x1280`.
- Do not add too many variants to a single texture. If I feel a variant is unnecessary, or there are too many, it will be denied.
- The border colour at the bottom (under all character lines) must be the same colour for the entire thing. It will not work if you try to use multiple colours.
- Do not submit textures generated using the plugin.

# Fonts
Fonts require you to create a model for every character.

These are the characters for a font.
Some characters use a name instead, since the characters are invalid for file names.
<details>
  <summary>Required characters</summary>
  <ul>
    <li><code>creeper</code></li>
    <li><code>a</code></li>
    <li><code>b</code></li>
    <li><code>c</code></li>
    <li><code>d</code></li>
    <li><code>e</code></li>
    <li><code>f</code></li>
    <li><code>g</code></li>
    <li><code>h</code></li>
    <li><code>i</code></li>
    <li><code>j</code></li>
    <li><code>k</code></li>
    <li><code>l</code></li>
    <li><code>m</code></li>
    <li><code>n</code></li>
    <li><code>o</code></li>
    <li><code>p</code></li>
    <li><code>q</code></li>
    <li><code>r</code></li>
    <li><code>s</code></li>
    <li><code>t</code></li>
    <li><code>u</code></li>
    <li><code>v</code></li>
    <li><code>w</code></li>
    <li><code>x</code></li>
    <li><code>y</code></li>
    <li><code>z</code></li>
    <li><code>£</code></li>
    <li><code>€</code></li>
    <li><code>0</code></li>
    <li><code>1</code></li>
    <li><code>2</code></li>
    <li><code>3</code></li>
    <li><code>4</code></li>
    <li><code>5</code></li>
    <li><code>6</code></li>
    <li><code>7</code></li>
    <li><code>8</code></li>
    <li><code>9</code></li>
    <li><code>&</code></li>
    <li><code>#</code></li>
    <li><code>(</code></li>
    <li><code>)</code></li>
    <li><code>[</code></li>
    <li><code>]</code></li>
    <li><code>{</code></li>
    <li><code>}</code></li>
    <li><code>forwardslash</code></li>
    <li><code>backwardslash</code></li>
    <li><code>questionmark</code></li>
    <li><code>!</code></li>
    <li><code>.</code></li>
    <li><code>colon</code></li>
    <li><code>-</code></li>
    <li><code>openquote</code></li>
    <li><code>'</code></li>
    <li><code>+</code></li>
    <li><code>=</code></li>
    <li><code>lessthan</code></li>
    <li><code>greaterthan</code></li>
    <li><code>%</code></li>
    <li><code>^</code></li>
    <li><code>asterisk</code></li>
    <li><code>~</code></li>
    <li><code>end</code> - The start terminator</li>
    <li><code>start</code> - The end terminator</li>
    <li><code>,</code></li>
    <li><code>;</code></li>
    <li><code>_</code></li>
    <li><code>$</code></li>
    <li><code>@</code></li>
  </ul>
</details>
<details>
  <summary>Optional characters</summary>
  <ul>
    <li><code>space</code> - The font will use this character instead of automatically generating a space</li>
    <li><code>spacer</code> - A 1px wide model to use when character spacing is used. This model will be stretched to fill the space.</li>
  </ul>
</details>

If you want to make a font using different characters, please make an issue about it first.

## Creating a font
1. To create a font, create a new folder inside the `fonts` directory with the ID of your font.
2. Inside this new folder, create the folders `characters`, `textures`, and `overlays`.
3. Create a `flat.png` texture inside the `textures` folder. This will be used for your UV.
4. Create the full layout for your UV.
   - Characters need to be arranged into rows, with the top face directly above the character, and the bottom face directly below.
   - You can have as many rows as you need, as long as you leave room for the border UV at the bottom.
   - 2px-wide spaces must be between the characters and the rows.
   - The orders of the characters doesn't matter, apart from the first 4, which must be: `Creeper A`, `A`, `B`, `C`. These 4 characters must also all be the same width.
   - If some characters are taller than the standard character height, they can go into their own rows.
   - You do not need to worry about making the border UVs at this time.
   - See the `minecraft-ten` and `minecraft-five-bold` textures for example UVs.
   - Font UVs must be `1000x320`.
5. Now it is time to create the models. For every character, create a model for it and save it to the characters folder using the name listed above in the characters list.
   - Characters are modelled using the `Java Block/Item` format. You will probably need to enable the `Deactivate Size Limit` Blockbench setting.
   - The borders for each character must be 2px thick (if your font has borders).
   - You can now add the border UVs to the texture as you create the borders. If you are unsure on how borders should work, see the `minecraft-ten` and `minecraft-five-bold` models for examples.
   - The UV for the borders must be located underneath all the character rows.
   - The baseline for the text must be at Y level 2, with the border going to Y level 0. If the font does not have a border, the text baseline needs to be Y level 0.
   - Keep characters centred in the scene.
   - Groups and textures in the model do not matter, they will be ignored when the font is compiled.
   - Try to create optimised models without unnecessary elements.
6. Create a `textures.json` file, following the formatting explained in the textures section.
   - The first texture must be `flat`, and is required for all fonts.
   - The second texture is the main texture, and will be the one that is automatically selected in the plugin.
   - All the other textures will be sorted by popularity over the last week.
7. Create at least one overlay texture. It doesn't matter what it is, but at least one is required.
8. Add your font to the `fonts.json` file found at the root of the repo. This file follows the following formatting:
```js
[
  {
    "id": "font-id", // Font ID (required)
    "author": "Ewan Howell", // Font author (required)
    "width": 36, // Width of first 4 characters, including border (required)
    "height": 36, // Character height, including border, but not characters that go above or below the baselines, such as a comma (required)
    "border": 212, // The Y coordinate of the top of the border UV (required)
    "faces": [ // List of coordinates defining the front faces of the rows of characters (required)
      [16, 48], // When there are two values, these are the top and bottom of the face
      [148, 154, 186, 194] // When there are four values, these are the top of the section over the topline, the top of the normal height, but bottom of the normal height, and the bottom of the section below the baseline. The first and second values can be the same if there is no section above the topline. Same goes for the baseline.
    ],
    "ends": [ // List of coordinates defining the top and bottom faces of the rows of characters (required)
      [0, 16, 48, 64], // First two values are the top and bottom Y coordinates of the top face, second two are the bottom face
      [132, 132, 186, 186] // If your font does not have top and bottom faces, you can make the top and bottom the same values, which should match the top and bottom of the front faces.
    ],
    "terminatorSpace": true, // The terminator characters should have a space between itself and the text (optional)
    "forcedTerminators": true, // The terminator characters will always be used and cannot be disabled (optional)
    "autoBorder": true, // Will generate an automatic border which is a single element around the entire text row (optional)
    "borderless": true, // The font has no border (optional)
    "overlay": true, // The font has an overlay texture that is applied over the top of the "gradient" texture mode. Requires an "overlay.png" in the textures folder. See the "minecraft-five-bold-block" for an example (optional)
    "example": [ // The example text to display in the dialog text preview. Only provide if you are creating characters for a different alphabet (optional)
      "ex😳mple", // The top text
      "text" // The bottom text
    ]
  }
]
```

## Testing your font
The easiest way to test your font is to modify the plugin to use your fork of this repo instead of the official one.

1. Download the plugin file from the [Blockbench Plugins](https://github.com/JannisX11/blockbench-plugins/blob/master/plugins/minecraft_title_generator.js) repository.
2. Edit the `repo` variable on line 2 to be your repo.
3. Uninstall the official plugin and install your modified one by dragging and dropping the file into Blockbench.
4. Compile the font using the compile script and commit the font to your fork, then view the font from within Blockbench!

To view all characters in your font, you can use `Help > Developer > Load Debug Minecraft Title Text`
