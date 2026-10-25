// Every photo is shrunk before storing (CLAUDE.md: JPEG, ≤1280px long edge).
// JPEG, not WebP: measured on a 12 MP camera photo with a 4× slowed CPU, WebP encoding took
// ~250 ms vs ~45 ms for JPEG, for a file only ~20% smaller (D23).

const MAX_EDGE = 1280
const QUALITY = 0.85

export async function compressPhoto(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()

  const jpeg = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', QUALITY))
  if (!jpeg) throw new Error('Could not process photo')
  return jpeg
}
