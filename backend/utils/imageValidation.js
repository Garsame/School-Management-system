const fs = require('fs/promises');
const path = require('path');

const IMAGE_MIME_EXTENSIONS = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp'
};

const getExtensionForMimeType = (mimeType) => IMAGE_MIME_EXTENSIONS[mimeType] || '';

const isAllowedImageMimeType = (mimeType) => Boolean(IMAGE_MIME_EXTENSIONS[mimeType]);

const isValidImageSignature = (mimeType, buffer) => {
    if (!Buffer.isBuffer(buffer) || buffer.length < 12) return false;
    if (mimeType === 'image/jpeg') {
        return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    }
    if (mimeType === 'image/png') {
        return buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    }
    if (mimeType === 'image/webp') {
        return buffer.subarray(0, 4).toString('ascii') === 'RIFF'
            && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
    }
    return false;
};

const removeUploadedFile = async (filePath) => {
    if (!filePath) return;
    await fs.unlink(filePath).catch(() => {});
};

const validateUploadedImageSignature = async (req, res, next) => {
    if (!req.file) return next();
    try {
        const header = await fs.readFile(req.file.path);
        if (!isValidImageSignature(req.file.mimetype, header)) {
            await removeUploadedFile(req.file.path);
            return res.status(400).json({ message: 'Uploaded image file is invalid or corrupted.' });
        }
        return next();
    } catch (error) {
        await removeUploadedFile(req.file?.path);
        return res.status(400).json({ message: 'Uploaded image file could not be verified.' });
    }
};

const ensureUploadPathInside = (baseDir, filePath) => {
    const resolvedBase = path.resolve(baseDir);
    const resolvedFile = path.resolve(filePath);
    return resolvedFile.startsWith(resolvedBase + path.sep);
};

module.exports = {
    getExtensionForMimeType,
    isAllowedImageMimeType,
    validateUploadedImageSignature,
    ensureUploadPathInside
};
