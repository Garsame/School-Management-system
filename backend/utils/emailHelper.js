const nodemailer = require('nodemailer');
const mongoose = require('mongoose');
const PlatformSetting = require('../models/PlatformSetting');

/**
 * Sends a platform notification email.
 * Fail-safe: will not throw errors or crash the transaction if SMTP is not configured or fails.
 * 
 * @param {string} emailType - One of: 'registration_pending', 'approved', 'rejected', 'suspended', 'reactivated'
 * @param {object} tenant - The tenant mongoose document or object
 * @param {object} adminUser - The tenant admin user object
 * @param {object} options - Additional variables like { reason, customHost }
 */
const sendPlatformEmail = async (emailType, tenant, adminUser, options = {}) => {
    // Skip DB lookups and SMTP network dispatch when MongoDB is disconnected (Test/Mock environment)
    if (!mongoose.connection || mongoose.connection.readyState === 0) {
        console.warn(`[SMTP Email Helper] Skipped sending email of type ${emailType}: MongoDB is disconnected (Test/Mock environment).`);
        return;
    }

    try {
        const settings = await PlatformSetting.findOne().lean();
        const smtpHost = settings?.smtpHost;
        const smtpPort = settings?.smtpPort;
        const smtpUser = settings?.smtpUser;
        const smtpPass = settings?.smtpPass;
        const senderEmail = settings?.senderEmail || 'noreply@madrasahub.com';
        const platformName = settings?.platformName || 'MadrasaHub';

        const adminEmail = adminUser?.email || tenant?.email;
        const adminName = adminUser?.name || 'Administrator';
        const schoolName = tenant?.name || 'your school';

        if (!adminEmail) {
            console.warn(`[SMTP Email Helper] Skipped sending email of type ${emailType}: No recipient email address available.`);
            return;
        }

        if (!smtpHost || !smtpPort || !smtpUser || !smtpPass) {
            console.warn(`[SMTP Email Helper] Skipped sending email of type ${emailType}: SMTP is not fully configured on the platform.`);
            return;
        }

        let subject = '';
        let htmlBody = '';
        let textBody = '';

        switch (emailType) {
            case 'registration_pending':
                subject = `[${platformName}] School Registration Received - Pending Approval`;
                textBody = `Dear ${adminName},\n\nThank you for registering ${schoolName} on ${platformName}.\n\nYour application has been received and is currently pending platform approval. We will review your registration shortly and send you an email update once the review is complete.\n\nBest regards,\n${platformName} Support Team`;
                htmlBody = `<p>Dear <strong>${adminName}</strong>,</p>
                            <p>Thank you for registering <strong>${schoolName}</strong> on ${platformName}.</p>
                            <p>Your application has been received and is currently <strong>pending platform approval</strong>. We will review your registration shortly and send you an email update once the review is complete.</p>
                            <p>Best regards,<br/>${platformName} Support Team</p>`;
                break;

            case 'approved':
                subject = `[${platformName}] School Approved - Welcome to ${platformName}!`;
                textBody = `Dear ${adminName},\n\nWe are pleased to inform you that your school, ${schoolName}, has been approved!\n\nYou can now log in to the school portal using the credentials you created during registration.\n\nBest regards,\n${platformName} Support Team`;
                htmlBody = `<p>Dear <strong>${adminName}</strong>,</p>
                            <p>We are pleased to inform you that your school, <strong>${schoolName}</strong>, has been approved!</p>
                            <p>You can now log in to the school portal using the credentials you created during registration.</p>
                            <p>Best regards,<br/>${platformName} Support Team</p>`;
                break;

            case 'rejected':
                const rejectReason = options.reason || 'No reason specified.';
                subject = `[${platformName}] School Registration Update - ${schoolName}`;
                textBody = `Dear ${adminName},\n\nThank you for your interest in ${platformName}. We regret to inform you that your registration for ${schoolName} could not be approved at this time.\n\nReason: ${rejectReason}\n\nIf you have any questions, please reply to this email or contact support.\n\nBest regards,\n${platformName} Support Team`;
                htmlBody = `<p>Dear <strong>${adminName}</strong>,</p>
                            <p>Thank you for your interest in ${platformName}. We regret to inform you that your registration for <strong>${schoolName}</strong> could not be approved at this time.</p>
                            <p><strong>Reason for rejection:</strong> ${rejectReason}</p>
                            <p>If you have any questions, please reply to this email or contact support.</p>
                            <p>Best regards,<br/>${platformName} Support Team</p>`;
                break;

            case 'suspended':
                const suspendReason = options.reason || 'No reason specified.';
                subject = `[${platformName}] Account Suspended - ${schoolName}`;
                textBody = `Dear ${adminName},\n\nPlease be notified that the school account for ${schoolName} has been suspended by the platform administration.\n\nReason: ${suspendReason}\n\nAll login access and normal operations have been temporarily disabled. Please contact platform support for assistance.\n\nBest regards,\n${platformName} Support Team`;
                htmlBody = `<p>Dear <strong>${adminName}</strong>,</p>
                            <p>Please be notified that the school account for <strong>${schoolName}</strong> has been suspended by the platform administration.</p>
                            <p><strong>Reason for suspension:</strong> ${suspendReason}</p>
                            <p>All login access and normal operations have been temporarily disabled. Please contact platform support for assistance.</p>
                            <p>Best regards,<br/>${platformName} Support Team</p>`;
                break;

            case 'reactivated':
                subject = `[${platformName}] Account Reactivated - ${schoolName}`;
                textBody = `Dear ${adminName},\n\nGreat news! The school account for ${schoolName} has been reactivated.\n\nYou and your staff can now log in and access the platform normally.\n\nBest regards,\n${platformName} Support Team`;
                htmlBody = `<p>Dear <strong>${adminName}</strong>,</p>
                            <p>Great news! The school account for <strong>${schoolName}</strong> has been reactivated.</p>
                            <p>You and your staff can now log in and access the platform normally.</p>
                            <p>Best regards,<br/>${platformName} Support Team</p>`;
                break;

            default:
                console.warn(`[SMTP Email Helper] Unknown email type: ${emailType}`);
                return;
        }

        const transporter = nodemailer.createTransport({
            host: smtpHost,
            port: parseInt(smtpPort) || 587,
            secure: parseInt(smtpPort) === 465,
            auth: {
                user: smtpUser,
                pass: smtpPass
            }
        });

        await transporter.sendMail({
            from: `"${platformName}" <${senderEmail}>`,
            to: adminEmail,
            subject: subject,
            text: textBody,
            html: htmlBody
        });

        console.log(`[SMTP Email Helper] Successfully dispatched ${emailType} email notification to ${adminEmail}`);
    } catch (error) {
        console.error(`[SMTP Email Helper] Error sending email of type ${emailType}: ${error.message}`);
    }
};

module.exports = {
    sendPlatformEmail
};
