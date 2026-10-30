import sharp from "sharp";

// Card delivery must not download multi-megabyte camera originals on a phone.
// Run only AFTER the public route's current consent/moderation checks. Never
// cache private originals or transformed bytes across authorization decisions.
export async function publicCardImage(image: Blob): Promise<Blob> {
  // Bound decoding as well as output size. Legacy/unsupported media keeps the
  // existing working fallback instead of making an approved upload disappear.
  if (image.size > 20 * 1024 * 1024) return image;
  try {
    const bytes = await sharp(Buffer.from(await image.arrayBuffer()), { limitInputPixels: 40_000_000, animated: false })
      .rotate()
      .resize({ width: 480, height: 480, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 76, effort: 3 })
      .toBuffer();
    return new Blob([new Uint8Array(bytes)], { type: "image/webp" });
  } catch {
    return image;
  }
}
