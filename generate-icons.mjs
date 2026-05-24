import sharp from 'sharp'
import { mkdirSync } from 'fs'

mkdirSync('public', { recursive: true })

const icons = [
  { file: 'public/icon-192.png',        size: 192 },
  { file: 'public/icon-512.png',        size: 512 },
  { file: 'public/apple-touch-icon.png', size: 180 },
]

for (const { file, size } of icons) {
  // Rounded corners mask
  const roundedCorners = Buffer.from(
    `<svg><rect x="0" y="0" width="${size}" height="${size}" rx="${Math.round(size * 0.18)}" ry="${Math.round(size * 0.18)}"/></svg>`
  )

  await sharp('logo-source.jpg')
    .resize(size, size, { fit: 'cover', position: 'centre' })
    .composite([{ input: roundedCorners, blend: 'dest-in' }])
    .png()
    .toFile(file)

  console.log(`✓ ${file}`)
}

console.log('Icons generated in /public')
