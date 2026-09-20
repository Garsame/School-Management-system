const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { validateUploadedImageSignature } = require('../utils/imageValidation');

const uploadDir = path.resolve(__dirname, '..', 'uploads', 'avatars');
fs.mkdirSync(uploadDir, { recursive: true });

const extensionByMimeType = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp'
};

const storage = multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, uploadDir),
    filename: (req, file, callback) => {
        const extension = extensionByMimeType[file.mimetype];
        const suffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
        callback(null, `avatar-${req.user._id}-${suffix}${extension}`);
    }
});

const avatarUpload = multer({
    storage,
    limits: { fileSize: 2 * 1024 * 1024, files: 1 },
    fileFilter: (_req, file, callback) => {
        if (extensionByMimeType[file.mimetype]) return callback(null, true);
        const error = new Error('Profile image must be a PNG, JPEG, or WebP file.');
        error.statusCode = 400;
        return callback(error);
    }
});

avatarUpload.validateUploadedImageSignature = validateUploadedImageSignature;

module.exports = avatarUpload;
