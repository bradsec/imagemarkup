import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createCanvas, loadImage } from '@napi-rs/canvas';

await mkdir('public', { recursive: true });
const logo = await loadImage(await readFile('public/assets/logo.svg'));

async function icon(name, size) {
  const canvas = createCanvas(size, size);
  canvas.getContext('2d').drawImage(logo, 0, 0, size, size);
  await writeFile(`public/${name}`, canvas.toBuffer('image/png'));
}

await Promise.all([
  icon('favicon-16x16.png', 16),
  icon('favicon-32x32.png', 32),
  icon('apple-touch-icon.png', 180),
  icon('android-chrome-192x192.png', 192),
  icon('android-chrome-512x512.png', 512),
]);

const png = await readFile('public/favicon-32x32.png');
const icoHeader = Buffer.alloc(22);
icoHeader.writeUInt16LE(1, 2);
icoHeader.writeUInt16LE(1, 4);
icoHeader[6] = 32;
icoHeader[7] = 32;
icoHeader.writeUInt16LE(1, 10);
icoHeader.writeUInt16LE(32, 12);
icoHeader.writeUInt32LE(png.length, 14);
icoHeader.writeUInt32LE(22, 18);
await writeFile('public/favicon.ico', Buffer.concat([icoHeader, png]));

const og = createCanvas(1200, 630);
const ctx = og.getContext('2d');
ctx.fillStyle = '#0f1420';
ctx.fillRect(0, 0, og.width, og.height);
ctx.drawImage(logo, 96, 167, 296, 296);
ctx.fillStyle = '#eef1f6';
ctx.font = 'bold 84px sans-serif';
ctx.fillText('imagemarkup', 450, 280);
ctx.fillStyle = '#9aa4b4';
ctx.font = '34px sans-serif';
ctx.fillText('Annotate images. Keep them private.', 454, 350);
await writeFile('public/og-image.png', og.toBuffer('image/png'));
