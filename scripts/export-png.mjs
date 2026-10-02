import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Minimalist SVG Logo definition provided for BUP Hall Dining System
const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="100%" height="100%">
  <defs>
    <!-- Deep Sleek Slate Surface -->
    <linearGradient id="bgSurface" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0F172A" />
      <stop offset="100%" stop-color="#020617" />
    </linearGradient>

    <!-- Refined Emerald Accent (BUP Core Identity) -->
    <linearGradient id="emeraldStroke" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#34D399" />
      <stop offset="100%" stop-color="#059669" />
    </linearGradient>

    <!-- Subtle Golden Touch -->
    <linearGradient id="goldAccent" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FBBF24" />
      <stop offset="100%" stop-color="#D97706" />
    </linearGradient>
  </defs>

  <!-- Background Base -->
  <rect width="512" height="512" rx="120" fill="url(#bgSurface)" />
  <rect width="504" height="504" x="4" y="4" rx="116" fill="none" stroke="#1E293B" stroke-width="2" />

  <!-- Minimal Plate Ring -->
  <circle cx="256" cy="216" r="120" fill="#090E17" stroke="url(#emeraldStroke)" stroke-width="5" />
  <circle cx="256" cy="216" r="94" fill="none" stroke="#1E293B" stroke-width="2" stroke-dasharray="4 6" />

  <!-- 3 Minimal Dots representing 3 Daily Meals (Breakfast, Lunch, Dinner) -->
  <circle cx="256" cy="180" r="10" fill="url(#goldAccent)" />
  <circle cx="220" cy="236" r="10" fill="url(#goldAccent)" />
  <circle cx="292" cy="236" r="10" fill="url(#goldAccent)" />

  <!-- Minimal Sleek Cutlery (Left: Fork Silhouette) -->
  <path d="M 106 170 L 106 205 C 106 215 112 223 118 225 L 118 270 C 118 273 120 275 123 275 C 126 275 128 273 128 270 L 128 225 C 134 223 140 215 140 205 L 140 170 M 117 170 L 117 200 M 129 170 L 129 200" fill="none" stroke="#64748B" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />

  <!-- Minimal Sleek Cutlery (Right: Spoon Silhouette) -->
  <path d="M 372 195 C 372 216 381 226 386 228 L 386 270 C 386 273 388 275 391 275 C 394 275 396 273 396 270 L 396 228 C 401 226 410 216 410 195 C 410 175 401 165 391 165 C 381 165 372 175 372 195 Z" fill="none" stroke="#64748B" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />

  <!-- Clean Minimalist Typography -->
  <text x="256" y="396" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="30" font-weight="700" fill="#F8FAFC">
    BUP HALL MEAL
  </text>
  
  <text x="256" y="424" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="12" font-weight="600" fill="#10B981">
    DINING SYSTEM
  </text>
</svg>`;

/**
 * Creates a valid ICO binary buffer containing a PNG image.
 * Structure of Windows ICO format:
 * - 6-byte header: Reserved (0), Type (1 for ICO), Image count (1)
 * - 16-byte directory entry: Width, Height, Colors, Reserved, Planes (1), BPP (32), Size, Offset (22)
 * - Raw PNG payload
 */
function createIcoFromPngBuffer(pngBuffer, size = 32) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // Reserved
  header.writeUInt16LE(1, 2); // Type 1 = Icon
  header.writeUInt16LE(1, 4); // 1 Image

  const entry = Buffer.alloc(16);
  entry.writeUInt8(size >= 256 ? 0 : size, 0); // Width
  entry.writeUInt8(size >= 256 ? 0 : size, 1); // Height
  entry.writeUInt8(0, 2); // Color palette
  entry.writeUInt8(0, 3); // Reserved
  entry.writeUInt16LE(1, 4); // Color planes
  entry.writeUInt16LE(32, 6); // Bits per pixel
  entry.writeUInt32LE(pngBuffer.length, 8); // Size of image data
  entry.writeUInt32LE(22, 12); // Offset of image data (6 header + 16 entry = 22)

  return Buffer.concat([header, entry, pngBuffer]);
}

async function exportIcons() {
  const publicDir = path.resolve(__dirname, "../public");
  const iconsDir = path.join(publicDir, "icons");

  // Ensure output directories exist
  if (!fs.existsSync(iconsDir)) {
    fs.mkdirSync(iconsDir, { recursive: true });
  }

  const svgBuffer = Buffer.from(svgContent);

  console.log("Generating BUP Hall Dining icons...");

  // 1. Generate icon-192x192.png
  const icon192Path = path.join(iconsDir, "icon-192x192.png");
  await sharp(svgBuffer)
    .resize(192, 192)
    .png({ quality: 100 })
    .toFile(icon192Path);
  console.log(`✓ Generated: ${path.relative(process.cwd(), icon192Path)}`);

  // 2. Generate icon-512x512.png
  const icon512Path = path.join(iconsDir, "icon-512x512.png");
  await sharp(svgBuffer)
    .resize(512, 512)
    .png({ quality: 100 })
    .toFile(icon512Path);
  console.log(`✓ Generated: ${path.relative(process.cwd(), icon512Path)}`);

  // 3. Generate favicon.ico (32x32 embedded in Windows ICO format)
  const faviconPngBuffer = await sharp(svgBuffer)
    .resize(32, 32)
    .png({ quality: 100 })
    .toBuffer();

  const icoBuffer = createIcoFromPngBuffer(faviconPngBuffer, 32);
  const faviconPath = path.join(publicDir, "favicon.ico");
  fs.writeFileSync(faviconPath, icoBuffer);
  console.log(`✓ Generated: ${path.relative(process.cwd(), faviconPath)}`);

  // Also save a copy of favicon.ico inside public/icons/ for convenience
  const faviconInIconsPath = path.join(iconsDir, "favicon.ico");
  fs.writeFileSync(faviconInIconsPath, icoBuffer);

  // Optional: Also save the original SVG for crisp vector usage
  const svgPath = path.join(iconsDir, "logo.svg");
  fs.writeFileSync(svgPath, svgContent);
  console.log(`✓ Saved SVG: ${path.relative(process.cwd(), svgPath)}`);

  console.log("\nAll icons generated successfully!");
}

exportIcons().catch((err) => {
  console.error("Error generating icons:", err);
  process.exit(1);
});
