const nodemailer = require('nodemailer');
const PlatformSetting = require('../models/PlatformSetting');

/**
 * Sends an email using the global SMTP settings stored in PlatformSetting.
 * 
 * @param {Object} options
 * @param {string} options.to - Recipient email address
 * @param {string} options.subject - Email subject
 * @param {string} [options.text] - Plain text content
 * @param {string} [options.html] - HTML content
 * @returns {Promise<boolean>} True if sent successfully, false otherwise
 */
const sendEmail = async ({ to, subject, text, html }) => {
    try {
        const settings = await PlatformSetting.findOne();
        if (!settings || !settings.smtpHost || !settings.smtpPort) {
            console.warn('[EMAIL SERVICE] SMTP not configured. Skipping email send.');
            return false;
        }

        const transporter = nodemailer.createTransport({
            host: settings.smtpHost,
            port: parseInt(settings.smtpPort) || 587,
            secure: parseInt(settings.smtpPort) === 465, // true for 465, false for other ports
            auth: settings.smtpUser && settings.smtpPass ? {
                user: settings.smtpUser,
                pass: settings.smtpPass
            } : undefined
        });

        const info = await transporter.sendMail({
            from: `"${settings.platformName || 'MadrasaHub'}" <${settings.senderEmail || 'noreply@madrasahub.com'}>`,
            to,
            subject,
            text,
            html
        });

        console.log(`[EMAIL SERVICE] Email sent successfully to ${to}:`, info.messageId);
        return true;
    } catch (error) {
        console.error(`[EMAIL SERVICE] Failed to send email to ${to}:`, error.message);
        return false;
    }
};

module.exports = {
    sendEmail
};
