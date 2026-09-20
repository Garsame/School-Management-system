const multer = require('multer');
const path = require('path');
const fs = require('fs');
const {
    getExtensionForMimeType,
    isAllowedImageMimeType,
    validateUploadedImageSignature
} = require('../utils/imageValidation');

// Ensure uploads directory exists
const uploadDir = path.resolve(__dirname, '..', 'uploads', 'logos');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'logo-' + uniqueSuffix + getExtensionForMimeType(file.mimetype));
    }
});

const fileFilter = (req, file, cb) => {
    if (isAllowedImageMimeType(file.mimetype)) {
        cb(null, true);
    } else {
        const error = new Error('Logo must be a PNG, JPEG, or WebP file.');
        error.statusCode = 400;
        cb(error, false);
    }
};

const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: { fileSize: 2 * 1024 * 1024 } // 2MB limit
});

upload.validateUploadedImageSignature = validateUploadedImageSignature;

module.exports = upload;
