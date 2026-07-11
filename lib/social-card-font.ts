import { readFile } from 'node:fs/promises'
import path from 'node:path'

type SocialCardFont = {
  name: string
  data: ArrayBuffer
  weight: 400 | 700
  style: 'normal'
}

const fontFiles = {
  400: 'ChironSungHK-OG-Regular.ttf',
  700: 'ChironSungHK-OG-Bold.ttf',
} as const

const fontDataPromises = new Map<400 | 700, Promise<ArrayBuffer>>()

function loadFontData(weight: 400 | 700) {
  const cached = fontDataPromises.get(weight)
  if (cached) return cached

  const promise = readFile(path.join(process.cwd(), 'public/static/fonts', fontFiles[weight])).then(
    (font) => font.buffer.slice(font.byteOffset, font.byteOffset + font.byteLength)
  )
  fontDataPromises.set(weight, promise)
  return promise
}

export async function loadSocialCardFonts(): Promise<SocialCardFont[]> {
  const [regular, bold] = await Promise.all([loadFontData(400), loadFontData(700)])

  return [
    { name: 'Chiron Sung HK', data: regular, weight: 400, style: 'normal' },
    { name: 'Chiron Sung HK', data: bold, weight: 700, style: 'normal' },
  ]
}
