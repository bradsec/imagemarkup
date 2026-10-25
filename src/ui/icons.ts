// Inline stroke icons (Lucide/Excalidraw style, 24px grid, currentColor).
// Bundled as SVG markup rather than a webfont so the app stays fully offline:
// loading an icon font from a CDN would break the "images never leave your device" promise.

export type IconName =
  | 'select' | 'pan' | 'rect' | 'ellipse' | 'line' | 'arrow' | 'pen' | 'highlighter'
  | 'text' | 'counter' | 'redaction' | 'crop' | 'image' | 'symbol'
  | 'undo' | 'redo' | 'zoom-in' | 'zoom-out' | 'fit' | 'actual-size'
  | 'download' | 'save' | 'folder-open' | 'copy' | 'trash' | 'transform' | 'frame'
  | 'eyedropper' | 'layer-front' | 'layer-back' | 'upload' | 'plus' | 'close' | 'image-plus'
  | 'lock' | 'lock-open' | 'link' | 'unlink' | 'eye' | 'eye-off' | 'chevron-up' | 'chevron-down';

// Google Material Symbols Outlined paths for non-tool icons. Keeping these as inline SVG
// avoids network requests. Tool icons use the custom stroke set in PATHS.
const MATERIAL_PATHS: Partial<Record<IconName, string>> = {
  lock: 'M240-80q-33 0-56.5-23.5T160-160v-400q0-33 23.5-56.5T240-640h40v-80q0-83 58.5-141.5T480-920q83 0 141.5 58.5T680-720v80h40q33 0 56.5 23.5T800-560v400q0 33-23.5 56.5T720-80H240Zm0-80h480v-400H240v400Zm240-120q33 0 56.5-23.5T560-360q0-33-23.5-56.5T480-440q-33 0-56.5 23.5T400-360q0 33 23.5 56.5T480-280ZM360-640h240v-80q0-50-35-85t-85-35q-50 0-85 35t-35 85v80Z',
  'lock-open': 'M240-640h360v-80q0-50-35-85t-85-35q-50 0-85 35t-35 85h-80q0-83 58.5-141.5T480-920q83 0 141.5 58.5T680-720v80h40q33 0 56.5 23.5T800-560v400q0 33-23.5 56.5T720-80H240q-33 0-56.5-23.5T160-160v-400q0-33 23.5-56.5T240-640Zm0 480h480v-400H240v400Zm240-120q33 0 56.5-23.5T560-360q0-33-23.5-56.5T480-440q-33 0-56.5 23.5T400-360q0 33 23.5 56.5T480-280Z',
};

// Inner SVG for each icon. Default rendering is stroked; elements that need a fill
// set fill="currentColor" stroke="none" explicitly.
const PATHS: Record<IconName, string> = {
  select: '<path class="tone" d="M5.5 4 18.5 9.8l-6 2-2.2 6.2z"/><path d="M5.5 4 18.5 9.8l-6 2-2.2 6.2z"/><path d="m12.5 11.8 5 5"/>',
  pan: '<path d="M9 11V6a1.5 1.5 0 0 1 3 0M12 11V5a1.5 1.5 0 0 1 3 0v6M15 11V7a1.5 1.5 0 0 1 3 0v7a6 6 0 0 1-6 6h-1a6 6 0 0 1-4.8-2.4l-3-4a1.6 1.6 0 0 1 2.6-1.8L9 15.5V6a1.5 1.5 0 0 1 3 0"/>',
  rect: '<rect class="tone" x="4" y="6" width="16" height="12" rx="2.5"/><rect x="4" y="6" width="16" height="12" rx="2.5"/>',
  ellipse: '<ellipse class="tone" cx="12" cy="12" rx="8.5" ry="6.5"/><ellipse cx="12" cy="12" rx="8.5" ry="6.5"/>',
  line: '<path d="M6 18 18 6"/><circle cx="6" cy="18" r="1.75" fill="currentColor"/><circle cx="18" cy="6" r="1.75" fill="currentColor"/>',
  arrow: '<path d="M5 19 14 10"/><path d="M19 5 17.6 13.6 10.4 6.4z" fill="currentColor"/>',
  pen: '<path class="tone" d="M4.5 19.5 5.6 15 15.6 5a2 2 0 0 1 2.8 0l.6.6a2 2 0 0 1 0 2.8L9 18.4z"/><path d="M4.5 19.5 5.6 15 15.6 5a2 2 0 0 1 2.8 0l.6.6a2 2 0 0 1 0 2.8L9 18.4z"/><path d="m13.5 7 3.5 3.5"/>',
  highlighter: '<path d="M12.5 20.5h8" stroke-width="3.5" stroke-opacity=".4"/><path class="tone" d="m8.5 14.5-2-2L15 4a1.8 1.8 0 0 1 2.5 0l.5.5a1.8 1.8 0 0 1 0 2.5L9.5 15.5z"/><path d="m8.5 14.5-2-2L15 4a1.8 1.8 0 0 1 2.5 0l.5.5a1.8 1.8 0 0 1 0 2.5L9.5 15.5zM6.5 12.5 3.5 18l2.5 2.5 5.5-3"/>',
  text: '<path d="M5.5 7V5h13v2M12 5v14M9 19h6"/>',
  counter: '<circle class="tone" cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="8.5"/><path d="M10.4 9.6 12.6 8v8.2M10.2 16.2h4.6"/>',
  redaction: '<path d="M4 6.5h8M15.5 6.5H20M4 17.5h5M12.5 17.5H20"/><rect x="4" y="10" width="16" height="4" rx="1" fill="currentColor"/>',
  crop: '<path d="M7 3v13.5a.5.5 0 0 0 .5.5H21"/><path d="M3 7h13.5a.5.5 0 0 1 .5.5V21"/>',
  image: '<rect class="tone" x="3.5" y="5" width="17" height="14" rx="2.5"/><rect x="3.5" y="5" width="17" height="14" rx="2.5"/><circle cx="9" cy="10" r="1.6"/><path d="m4 17.5 5-4.5 3.5 3 2.5-2 5 4"/>',
  symbol: '<path class="tone" d="m12 3.8 2.5 5.1 5.6.8-4.05 3.95.95 5.6L12 16.6l-5 2.65.95-5.6L3.9 9.7l5.6-.8z"/><path d="m12 3.8 2.5 5.1 5.6.8-4.05 3.95.95 5.6L12 16.6l-5 2.65.95-5.6L3.9 9.7l5.6-.8z"/>',
  undo: '<path d="M9 7 4 12l5 5M4 12h11a5 5 0 0 1 0 10h-1"/>',
  redo: '<path d="m15 7 5 5-5 5M20 12H9a5 5 0 0 0 0 10h1"/>',
  'zoom-in': '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3M11 8v6M8 11h6"/>',
  'zoom-out': '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3M8 11h6"/>',
  fit: '<path d="M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4"/>',
  'actual-size': '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9 15V9l-1.5 1M13 15c2 0 2.5-6-2-3.5"/>',
  download: '<path d="M12 3v11M8 10l4 4 4-4M5 20h14"/>',
  save: '<path d="M5 4h11l3 3v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM8 4v5h7V4M8 19v-6h8v6"/>',
  'folder-open': '<path d="M4 8V6a1 1 0 0 1 1-1h4l2 2h7a1 1 0 0 1 1 1v2M3.4 11.6A1 1 0 0 1 4.4 10.3h16a1 1 0 0 1 1 1.2l-1.3 6.5a1 1 0 0 1-1 .8H5.4a1 1 0 0 1-1-.8z"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M4 16V5a1 1 0 0 1 1-1h11"/>',
  trash: '<path d="M4 6h16M9 6V4h6v2M6 6l1 14h10l1-14M10 10v6M14 10v6"/>',
  transform: '<path d="M4 12a8 8 0 0 1 14-5.3L20 8M20 4v4h-4M20 12a8 8 0 0 1-14 5.3L4 16M4 20v-4h4"/>',
  frame: '<path d="M6 3v18M18 3v18M3 6h18M3 18h18"/>',
  eyedropper: '<path d="m18 3 3 3-9 9-3-3zM12 9l-6 6-2 4 4-2 6-6"/>',
  'layer-front': '<path d="M12 3 3 8l9 5 9-5zM3 14l9 5 9-5"/>',
  'layer-back': '<path d="M12 5 5 9l7 4 7-4zM5 15l7 4 7-4" opacity=".95"/>',
  upload: '<path d="M12 15V4M8 8l4-4 4 4M5 20h14"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  'image-plus': '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="8.5" cy="9.5" r="1.6"/><path d="m4 17 4.5-4.5a2 2 0 0 1 2.8 0L15 19M17 3v6M14 6h6"/>',
  lock: '',
  'lock-open': '',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.1 1.1M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.1-1.1"/>',
  unlink: '<path d="m8 2 1 3M2 8l3 1M16 22l-1-3M22 16l-3-1M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-5.4-8.1M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 5.4 8.1"/>',
  eye: '<path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.5"/>',
  'eye-off': '<path d="m3 3 18 18M10.6 6.2A10.5 10.5 0 0 1 12 6c6 0 9.5 6 9.5 6a15 15 0 0 1-2.1 2.8M6.2 6.2C3.8 7.8 2.5 12 2.5 12s3.5 6 9.5 6c1.5 0 2.8-.4 4-1"/><path d="M9.9 9.9A3 3 0 0 0 14.1 14.1"/>',
  'chevron-up': '<path d="m6 15 6-6 6 6"/>',
  'chevron-down': '<path d="m6 9 6 6 6-6"/>',
};

export function icon(name: IconName, size = 20): string {
  const materialPath = MATERIAL_PATHS[name];
  if (materialPath) return `<svg class="ico material-ico" viewBox="0 -960 960 960" width="${size}" height="${size}" fill="currentColor" aria-hidden="true"><path d="${materialPath}"/></svg>`;
  return `<svg class="ico" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name]}</svg>`;
}
