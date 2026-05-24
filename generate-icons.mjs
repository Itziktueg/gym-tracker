import sharp from 'sharp'
import { mkdirSync } from 'fs'

mkdirSync('public', { recursive: true })

// Simple dumbbell SVG on a green background
function makeSvg(size) {
  const r = Math.round(size * 0.18)  // corner radius
  const s = size
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="${Math.round(r * 100 / size)}" fill="#16a34a"/>
  <rect x="20" y="43" width="60" height="14" rx="4" fill="white"/>
  <rect x="12" y="32" width="18" height="36" rx="5" fill="white"/>
  <rect x="70" y="32" width="18" height="36" rx="5" fill="white"/>
  <rect x="6"  y="37" width="10" height="26" rx="3" fill="white"/>
  <rect x="84" y="37" width="10" height="26" rx="3" fill="white"/>
</svg>`
}

const icons = [
  { file: 'public/icon-192.png',       size: 192 },
  { file: 'public/icon-512.png',       size: 512 },
  { file: 'public/apple-touch-icon.png', size: 180 },
]

for (const { file, size } of icons) {
  await sharp(Buffer.from(makeSvg(size)))
    .png()
    .toFile(file)
  console.log(`✓ ${file}`)
}

console.log('Icons generated in /public')
