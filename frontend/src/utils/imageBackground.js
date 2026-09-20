const MAX_LOGO_DIMENSION = 1000;
const COLOR_TOLERANCE = 58;
const FULLY_TRANSPARENT_DISTANCE = 30;
const FEATHER_DISTANCE = 62;

const loadImage = (file) => new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
        URL.revokeObjectURL(objectUrl);
        resolve(image);
    };
    image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('The selected logo could not be read.'));
    };
    image.src = objectUrl;
});

const toPngBlob = (canvas) => new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('The transparent logo could not be created.'));
    }, 'image/png');
});

const colorDistance = (data, offset, background) => Math.max(
    Math.abs(data[offset] - background[0]),
    Math.abs(data[offset + 1] - background[1]),
    Math.abs(data[offset + 2] - background[2]),
);

const clampColor = (value) => Math.max(0, Math.min(255, Math.round(value)));

export const removeSolidImageBackground = async (file) => {
    if (!file?.type?.startsWith('image/') || file.type === 'image/svg+xml') {
        throw new Error('Background removal is available for PNG, JPG, and WebP logos.');
    }

    const image = await loadImage(file);
    const scale = Math.min(1, MAX_LOGO_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0, width, height);

    const imageData = context.getImageData(0, 0, width, height);
    const { data } = imageData;
    const cornerPixels = [0, width - 1, (height - 1) * width, (height * width) - 1];
    const visibleCorners = cornerPixels
        .map((position) => position * 4)
        .filter((offset) => data[offset + 3] > 24);

    if (visibleCorners.length === 0) {
        throw new Error('This logo already has a transparent background.');
    }

    const background = [0, 1, 2].map((channel) => Math.round(
        visibleCorners.reduce((total, offset) => total + data[offset + channel], 0) / visibleCorners.length,
    ));
    const visited = new Uint8Array(width * height);
    const stack = new Int32Array(width * height);
    let stackSize = 0;
    let removedPixels = 0;

    const enqueue = (position) => {
        if (position < 0 || position >= visited.length || visited[position]) return;
        visited[position] = 1;
        const offset = position * 4;
        if (data[offset + 3] <= 24 || colorDistance(data, offset, background) <= COLOR_TOLERANCE) {
            stack[stackSize] = position;
            stackSize += 1;
        }
    };

    for (let x = 0; x < width; x += 1) {
        enqueue(x);
        enqueue(((height - 1) * width) + x);
    }
    for (let y = 0; y < height; y += 1) {
        enqueue(y * width);
        enqueue((y * width) + width - 1);
    }

    while (stackSize > 0) {
        stackSize -= 1;
        const position = stack[stackSize];
        const offset = position * 4;
        if (data[offset + 3] > 0) {
            data[offset + 3] = 0;
            removedPixels += 1;
        }
        const x = position % width;
        if (x > 0) enqueue(position - 1);
        if (x < width - 1) enqueue(position + 1);
        if (position >= width) enqueue(position - width);
        if (position < width * (height - 1)) enqueue(position + width);
    }

    for (let position = 0; position < width * height; position += 1) {
        const offset = position * 4;
        if (data[offset + 3] === 0) continue;
        const distance = colorDistance(data, offset, background);

        if (distance <= FULLY_TRANSPARENT_DISTANCE) {
            data[offset + 3] = 0;
            removedPixels += 1;
            continue;
        }

        if (distance < FEATHER_DISTANCE) {
            const foregroundStrength = (distance - FULLY_TRANSPARENT_DISTANCE)
                / (FEATHER_DISTANCE - FULLY_TRANSPARENT_DISTANCE);
            const originalAlpha = data[offset + 3];
            for (let channel = 0; channel < 3; channel += 1) {
                data[offset + channel] = clampColor(
                    (data[offset + channel] - (background[channel] * (1 - foregroundStrength)))
                    / foregroundStrength,
                );
            }
            data[offset + 3] = Math.round(originalAlpha * foregroundStrength);
        }
    }

    if (removedPixels < Math.max(16, width * height * 0.005)) {
        throw new Error('No removable solid background was detected.');
    }

    context.putImageData(imageData, 0, 0);

    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    for (let position = 0; position < width * height; position += 1) {
        if (data[(position * 4) + 3] <= 8) continue;
        const x = position % width;
        const y = Math.floor(position / width);
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
    }

    if (maxX < minX || maxY < minY) {
        throw new Error('Background removal left no visible logo artwork.');
    }

    const padding = Math.max(2, Math.round(Math.max(width, height) * 0.015));
    const cropX = Math.max(0, minX - padding);
    const cropY = Math.max(0, minY - padding);
    const cropWidth = Math.min(width - cropX, (maxX - minX + 1) + (padding * 2));
    const cropHeight = Math.min(height - cropY, (maxY - minY + 1) + (padding * 2));
    const outputCanvas = document.createElement('canvas');
    outputCanvas.width = cropWidth;
    outputCanvas.height = cropHeight;
    outputCanvas.getContext('2d').drawImage(
        canvas,
        cropX,
        cropY,
        cropWidth,
        cropHeight,
        0,
        0,
        cropWidth,
        cropHeight,
    );

    const blob = await toPngBlob(outputCanvas);
    const baseName = file.name.replace(/\.[^.]+$/, '') || 'school-logo';
    return new File([blob], `${baseName}-transparent.png`, {
        type: 'image/png',
        lastModified: Date.now(),
    });
};
