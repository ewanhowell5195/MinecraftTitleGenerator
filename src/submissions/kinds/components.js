import FontAssetFields from "./FontAssetFields.vue"
import FontAssetPreview from "./FontAssetPreview.vue"
import FontFields from "./FontFields.vue"
import FontPreview from "./FontPreview.vue"
import StripFields from "./StripFields.vue"
import StripPreview from "./StripPreview.vue"
import ShapeFields from "./ShapeFields.vue"
import ShapePreview from "./ShapePreview.vue"
import TileableFields from "./TileableFields.vue"
import TileablePreview from "./TileablePreview.vue"

export const KIND_COMPONENTS = {
  texture: { Fields: FontAssetFields, Preview: FontAssetPreview },
  overlay: { Fields: FontAssetFields, Preview: FontAssetPreview },
  strip: { Fields: StripFields, Preview: StripPreview },
  tileable: { Fields: TileableFields, Preview: TileablePreview },
  font: { Fields: FontFields, Preview: FontPreview },
  shapeImage: { Fields: ShapeFields, Preview: ShapePreview },
  shapeModel: { Fields: ShapeFields, Preview: ShapePreview }
}
