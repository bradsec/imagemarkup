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

// Google Material Symbols Outlined paths. Keeping these as inline SVG avoids
// network requests and gives every tool the same 24 px optical grid.
const MATERIAL_PATHS: Partial<Record<IconName, string>> = {
  select: 'M516-120 402-402 120-516v-56l720-268-268 720h-56Zm26-148 162-436-436 162 196 78 78 196Zm-78-196Z',
  pan: 'M402-40q-30 0-56-13.5T303-92L48-465l24-23q19-19 45-22t47 12l116 81v-383q0-17 11.5-28.5T320-840q17 0 28.5 11.5T360-800v537L212-367l157 229q5 8 14 13t19 5h278q33 0 56.5-23.5T760-200v-560q0-17 11.5-28.5T800-800q17 0 28.5 11.5T840-760v560q0 66-47 113T680-40H402Zm38-440v-400q0-17 11.5-28.5T480-920q17 0 28.5 11.5T520-880v400h-80Zm160 0v-360q0-17 11.5-28.5T640-880q17 0 28.5 11.5T680-840v360h-80ZM486-300Z',
  rect: 'M200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Zm0-80h560v-560H200v560Z',
  ellipse: 'M480-80q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-80q134 0 227-93t93-227q0-134-93-227t-227-93q-134 0-227 93t-93 227q0 134 93 227t227 93Zm0-320Z',
  line: 'M160-440v-80h640v80H160Z',
  arrow: 'm256-240-56-56 384-384H240v-80h480v480h-80v-344L256-240Z',
  pen: 'M160-120v-170l527-526q12-12 27-18t30-6q16 0 30.5 6t25.5 18l56 56q12 11 18 25.5t6 30.5q0 15-6 30t-18 27L330-120H160Zm80-80h56l393-392-28-29-29-28-392 393v56Z',
  highlighter: 'M544-400 440-504 240-304l104 104 200-200Zm-47-161 104 104 199-199-104-104-199 199Zm-84-28 216 216-229 229q-24 24-56 24t-56-24l-2-2-26 26H60l126-126-2-2q-24-24-24-56t24-56l229-229Zm0 0 227-227q24-24 56-24t56 24l104 104q24 24 24 56t-24 56L629-373 413-589Z',
  text: 'M420-160v-520H200v-120h560v120H540v520H420Z',
  counter: 'M480-80q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-80q134 0 227-93t93-227q0-134-93-227t-227-93q-134 0-227 93t-93 227q0 134 93 227t227 93Zm-20-120h80v-400H380v80h80v320Z',
  redaction: 'M120-520v-320h320v320H120Zm0 400v-320h320v320H120Zm400-400v-320h320v320H520Zm0 400v-320h320v320H520ZM200-600h160v-160H200v160Zm400 0h160v-160H600v160Zm0 400h160v-160H600v160Zm-400 0h160v-160H200v160Z',
  crop: 'M680-40v-160H280q-33 0-56.5-23.5T200-280v-400H40v-80h160v-160h80v640h640v80H760v160h-80Zm0-320v-320H360v-80h320q33 0 56.5 23.5T760-680v320h-80Z',
  image: 'M200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Zm0-80h560v-560H200v560Zm40-80h480L570-480 450-320l-90-120-120 160Z',
  symbol: 'M320-242q10 1 19.5 1.5t20.5.5q11 0 20.5-.5T400-242v82h400v-400h-82q2-20 2-40t-2-40h82q33 0 56.5 23.5T880-560v400q0 33-23.5 56.5T800-80H400q-33 0-56.5-23.5T320-160v-82Zm40-78q-117 0-198.5-81.5T80-600q0-117 81.5-198.5T360-880q117 0 198.5 81.5T640-600q0 117-81.5 198.5T360-320Zm0-80q83 0 141.5-58.5T560-600q0-83-58.5-141.5T360-800q-83 0-141.5 58.5T160-600q0 83 58.5 141.5T360-400Z',
  lock: 'M240-80q-33 0-56.5-23.5T160-160v-400q0-33 23.5-56.5T240-640h40v-80q0-83 58.5-141.5T480-920q83 0 141.5 58.5T680-720v80h40q33 0 56.5 23.5T800-560v400q0 33-23.5 56.5T720-80H240Zm0-80h480v-400H240v400Zm240-120q33 0 56.5-23.5T560-360q0-33-23.5-56.5T480-440q-33 0-56.5 23.5T400-360q0 33 23.5 56.5T480-280ZM360-640h240v-80q0-50-35-85t-85-35q-50 0-85 35t-35 85v80Z',
  'lock-open': 'M240-640h360v-80q0-50-35-85t-85-35q-50 0-85 35t-35 85h-80q0-83 58.5-141.5T480-920q83 0 141.5 58.5T680-720v80h40q33 0 56.5 23.5T800-560v400q0 33-23.5 56.5T720-80H240q-33 0-56.5-23.5T160-160v-400q0-33 23.5-56.5T240-640Zm0 480h480v-400H240v400Zm240-120q33 0 56.5-23.5T560-360q0-33-23.5-56.5T480-440q-33 0-56.5 23.5T400-360q0 33 23.5 56.5T480-280Z',
};

// Inner SVG for each icon. Default rendering is stroked; elements that need a fill
// set fill="currentColor" stroke="none" explicitly.
const PATHS: Record<IconName, string> = {
  select: '<path d="M4 3.5 18.5 10 12 12l-2 6.5z"/>',
  pan: '<path d="M9 11V6a1.5 1.5 0 0 1 3 0M12 11V5a1.5 1.5 0 0 1 3 0v6M15 11V7a1.5 1.5 0 0 1 3 0v7a6 6 0 0 1-6 6h-1a6 6 0 0 1-4.8-2.4l-3-4a1.6 1.6 0 0 1 2.6-1.8L9 15.5V6a1.5 1.5 0 0 1 3 0"/>',
  rect: '<rect x="3.5" y="5.5" width="17" height="13" rx="2"/>',
  ellipse: '<ellipse cx="12" cy="12" rx="9" ry="7.5"/>',
  line: '<path d="M5 19 19 5"/>',
  arrow: '<path d="M5 19 19 5M11 5h8v8"/>',
  pen: '<path d="M14 5.5 18.5 10 8 20.5l-5 1 1-5zM12.5 7 17 11.5"/>',
  highlighter: '<path d="m9 11 6 6-3.5 3.5H6l-1.5-1.5zM11 9l4-4 5 5-4 4z"/>',
  text: '<path d="M5 6V5h14v1M12 5v14M9 19h6"/>',
  counter: '<circle cx="12" cy="12" r="8.5"/><path d="M11 9.5 12.5 8.5v7M10.5 15.5h4"/>',
  redaction:
    '<g fill="currentColor" stroke="none"><rect x="4" y="4" width="5" height="5" rx="1"/><rect x="14" y="4" width="5" height="5" rx="1"/><rect x="9" y="9" width="5" height="5" rx="1"/><rect x="4" y="14" width="5" height="5" rx="1"/><rect x="14" y="14" width="5" height="5" rx="1"/></g>',
  crop: '<path d="M7 2v15a1 1 0 0 0 1 1h15M2 7h15a1 1 0 0 1 1 1v15"/>',
  image: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="8.5" cy="9.5" r="1.6"/><path d="m4 17 4.5-4.5a2 2 0 0 1 2.8 0L20 21"/>',
  symbol: '<path d="M12 3.5 14.6 8.9l5.9.8-4.3 4.2 1 5.9-5.2-2.8-5.2 2.8 1-5.9L3.5 9.7l5.9-.8z"/>',
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
