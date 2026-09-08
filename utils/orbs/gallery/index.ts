// The gallery — 15 hand-drawn voiceorbs styles behind one lifecycle
// contract, selectable in the voice settings with live previews.

export { GalleryOrb, default } from './GalleryOrb';
export { useGalleryPicture, hexToRgb, type UseGalleryPictureOptions } from './useGalleryPicture';
export { recordGalleryPicture } from './paint';
export {
  ORB_STYLES,
  DEFAULT_GALLERY_STYLE,
  resolveOrbStyle,
  isGalleryStyle,
} from './registry';
export type { OrbStyleId, GalleryState, OrbStyleMeta, GalleryOrbProps } from './types';