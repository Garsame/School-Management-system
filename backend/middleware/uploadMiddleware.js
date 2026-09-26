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

// 5 MB. Nginx allows 6 MB, so the app is the limit the user meets, and it leaves room for
// the transparent PNG the "remove background" tool produces, which is often several times
// larger than the JPG that went in.
const MAX_LOGO_BYTES = 5 * 1024 * 1024;

const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: { fileSize: MAX_LOGO_BYTES, files: 1 }
});

upload.validateUploadedImageSignature = validateUploadedImageSignature;

/**
 * Accept one logo, and say plainly what went wrong when it is refused.
 *
 * Multer reports its own problems through an error with a `code` and no `statusCode`, so the
 * server's error handler treated "file too large" as a crash: the user saw HTTP 500 and
 * "Internal server error", with the real reason only in the server log. That is why the logo
 * upload looked broken. The avatar route already wrapped multer this way; logos did not.
 */
const uploadLogo = (req, res, next) => {
    upload.single('logo')(req, res, (error) => {
        if (!error) return validateUploadedImageSignature(req, res, next);

        const messages = {
            LIMIT_FILE_SIZE: `The logo must be ${Math.round(MAX_LOGO_BYTES / (1024 * 1024))} MB or smaller.`,
            LIMIT_FILE_COUNT: 'Upload one logo at a time.',
            LIMIT_UNEXPECTED_FILE: 'The logo must be sent in a field named "logo".',
            LIMIT_PART_COUNT: 'The upload had too many parts.',
            LIMIT_FIELD_KEY: 'A field name in the upload was too long.',
            LIMIT_FIELD_VALUE: 'A field value in the upload was too long.'
        };

        const message = messages[error.code] || error.message || 'The logo could not be uploaded.';
        return res.status(error.statusCode || 400).json({ success: false, message });
    });
};

module.exports = upload;
module.exports.MAX_LOGO_BYTES = MAX_LOGO_BYTES;
module.exports.uploadLogo = uploadLogo;
