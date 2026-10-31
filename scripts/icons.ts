// Renders the app icon (src/app/icon.svg) to the PNG sizes the PWA manifest and iOS need.
// Run after changing the SVG: bun scripts/icons.ts
import sharp from "sharp";

const svg = await Bun.file("src/app/icon.svg").arrayBuffer();
const out: Array<[string, number]> = [
  ["public/icons/icon-192.png", 192],
  ["public/icons/icon-512.png", 512],
  ["src/app/apple-icon.png", 180],
];
for (const [path, size] of out) {
  await sharp(Buffer.from(svg), { density: 300 }).resize(size, size).png({ compressionLevel: 9 }).toFile(path);
  console.log(path, size);
}
