import manifest from '../server/artwork-manifest.json' with {type:'json'};

/** Keep logical paths in saved themes and crop metadata; resolve only when rendering. */
export function artworkUrl(path: string): string {
  return (manifest as Record<string,{url:string}>)[path]?.url ?? path;
}

/** Tile-sized table art (960×640) for pickers and cards; the full artwork when no thumbnail is published. */
export function artworkThumbnailUrl(path: string): string {
  const thumbnail = path.replace(/-overhead\.(?:png|webp)$/, '-thumb.webp');
  return thumbnail !== path && thumbnail in manifest ? artworkUrl(thumbnail) : artworkUrl(path);
}
