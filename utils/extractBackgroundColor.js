const fs = require('fs');
const { PNG } = require('pngjs');

/**
 * Extracts the dominant background color from a PNG image file.
 * Samples edge and corner pixel regions, filtering out white/black foreground elements and transparency.
 * 
 * @param {string|Buffer} imageInput - File path or Buffer of PNG image
 * @returns {Promise<string>} Hex color string e.g. "#DDAA18"
 */
async function extractBackgroundColor(imageInput) {
    try {
        let buffer;
        if (typeof imageInput === 'string') {
            if (!fs.existsSync(imageInput)) {
                return '';
            }
            buffer = fs.readFileSync(imageInput);
        } else if (Buffer.isBuffer(imageInput)) {
            buffer = imageInput;
        } else {
            return '';
        }

        const png = PNG.sync.read(buffer);
        const { width, height, data } = png;

        const pixelCounts = {};
        const exactRgbSums = {};

        const samplePixel = (x, y) => {
            if (x < 0 || x >= width || y < 0 || y >= height) return;
            const idx = (width * y + x) << 2;
            const r = data[idx];
            const g = data[idx + 1];
            const b = data[idx + 2];
            const a = data[idx + 3];

            // Ignore transparent pixels
            if (a < 128) return;

            // Ignore extreme white (likely icons / text)
            if (r > 250 && g > 250 && b > 250) return;

            // Ignore extreme black (likely text / outlines)
            if (r < 8 && g < 8 && b < 8) return;

            // Quantize to cluster slight variations (step of 4)
            const qR = Math.round(r / 4) * 4;
            const qG = Math.round(g / 4) * 4;
            const qB = Math.round(b / 4) * 4;
            const key = `${qR},${qG},${qB}`;

            if (!pixelCounts[key]) {
                pixelCounts[key] = 0;
                exactRgbSums[key] = { r: 0, g: 0, b: 0 };
            }
            pixelCounts[key]++;
            exactRgbSums[key].r += r;
            exactRgbSums[key].g += g;
            exactRgbSums[key].b += b;
        };

        // 1. Sample 4 corners (20% margin box)
        const cornerW = Math.max(1, Math.floor(width * 0.2));
        const cornerH = Math.max(1, Math.floor(height * 0.2));

        for (let y = 0; y < cornerH; y++) {
            for (let x = 0; x < cornerW; x++) {
                samplePixel(x, y); // Top-Left
                samplePixel(width - 1 - x, y); // Top-Right
                samplePixel(x, height - 1 - y); // Bottom-Left
                samplePixel(width - 1 - x, height - 1 - y); // Bottom-Right
            }
        }

        // 2. Sample outer borders (5px perimeter)
        for (let x = 0; x < width; x++) {
            for (let border = 0; border < 5; border++) {
                samplePixel(x, border);
                samplePixel(x, height - 1 - border);
            }
        }
        for (let y = 0; y < height; y++) {
            for (let border = 0; border < 5; border++) {
                samplePixel(border, y);
                samplePixel(width - 1 - border, y);
            }
        }

        let bestKey = null;
        let maxCount = 0;

        for (const [key, count] of Object.entries(pixelCounts)) {
            if (count > maxCount) {
                maxCount = count;
                bestKey = key;
            }
        }

        // Fallback if strict filters eliminated all edge pixels (e.g., solid white/black background)
        if (!bestKey) {
            const fallbackCounts = {};
            for (let y = 0; y < Math.min(10, height); y++) {
                for (let x = 0; x < width; x++) {
                    const idx = (width * y + x) << 2;
                    const r = data[idx];
                    const g = data[idx + 1];
                    const b = data[idx + 2];
                    const a = data[idx + 3];
                    if (a >= 128) {
                        const key = `${r},${g},${b}`;
                        fallbackCounts[key] = (fallbackCounts[key] || 0) + 1;
                    }
                }
            }
            let fbMax = 0;
            for (const [k, cnt] of Object.entries(fallbackCounts)) {
                if (cnt > fbMax) {
                    fbMax = cnt;
                    bestKey = k;
                }
            }
            if (bestKey) {
                const [r, g, b] = bestKey.split(',').map(Number);
                const toHex = (n) => n.toString(16).padStart(2, '0').toUpperCase();
                return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
            }
            return '';
        }

        const sum = exactRgbSums[bestKey];
        const avgR = Math.round(sum.r / maxCount);
        const avgG = Math.round(sum.g / maxCount);
        const avgB = Math.round(sum.b / maxCount);

        const toHex = (n) => Math.min(255, Math.max(0, n)).toString(16).padStart(2, '0').toUpperCase();
        return `#${toHex(avgR)}${toHex(avgG)}${toHex(avgB)}`;
    } catch (error) {
        console.error('Error extracting background color:', error);
        return '';
    }
}

module.exports = extractBackgroundColor;
