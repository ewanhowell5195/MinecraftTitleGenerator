# Shapes

A shape is a single object used in place of text. It is either a PNG or a Java block model.

## PNG shapes

The PNG's solid pixels make the shape, and its colours paint the front. The top and bottom edges take the colours next to them.

- 8 to 64 pixels tall and up to 128 wide, not counting see-through pixels around it
- Pixels at least half opaque count as solid
- It can use up to 8 [strip types](textures.md#strip-types), the same as a font

A PNG shape is stored like a [font](fonts.md#folder) with one character, `x`, and gets the same textures and generated overlays.

## Model shapes

A Java block model and the one PNG it uses as its texture. The texture's UVs from 0 to 16 cover the whole image. The model cannot use a parent model.

The model is scaled to fit the generator and moved to sit on the baseline when it is added.

## Files

Each shape has a folder in `public/shapes`, and is listed in `shapes.json`:

```json
[
  { "id": "minecraft-ten-blank", "name": "Minecraft Ten (Blank)", "authors": ["Ewan Howell"], "kind": "png", "order": "x", "strips": ["minecraft-ten"] },
  { "id": "heart", "authors": ["Ewan Howell"], "kind": "model", "height": 32 }
]
```

| Key | Does |
| --- | --- |
| `id` | The shape's ID and folder name |
| `name` | The name shown in the generator, if not the ID in title case |
| `authors` | Everyone who made it |
| `kind` | `"png"` or `"model"` |
| `order` | PNG shapes only, always `"x"` |
| `strips` | PNG shapes only, the strip types it uses |
| `height` | Model shapes only, how tall the model is |

A model shape's folder has `model.json`, `textures.json`, and its textures and overlays in `textures` and `overlays`, with the same keys as a [font's](textures.md#texturesjson).
