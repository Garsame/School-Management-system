const Notification = require('../models/Notification');
const User = require('../models/User');
const { sendEmail } = require('./emailService');

/**
 * Dispatches an in-app notification to a user.
 */
const createNotification = async ({ tenantId, recipientId, title, message, type }) => {
    try {
        if (!tenantId || !recipientId || !title || !message) {
            console.error('[NOTIFICATION SERVICE] Missing required notification fields');
            return null;
        }

        const notification = await Notification.create({
            tenantId,
            recipientId,
            title,
            message,
            type: type || 'General',
            isRead: false
        });

        // Automated Alert Engine: Send transactional email if recipient has configured email address
        try {
            const recipientUser = await User.findOne({ _id: recipientId, tenantId }).lean();
            if (recipientUser && recipientUser.email) {
                sendEmail({
                    to: recipientUser.email,
                    subject: title,
                    text: message,
                    html: `
                        <div style="font-family: sans-serif; padding: 20px; color: #1b2a4a; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px;">
                            <h2 style="color: #4477f5; margin-top: 0;">${title}</h2>
                            <p style="font-size: 15px; line-height: 1.6; color: #4a5568;">${message}</p>
                            <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
                            <p style="font-size: 11px; color: #a0aec0; margin-bottom: 0; text-align: center;">
                                This is an automated notification from MadrasaHub. Please do not reply directly to this email.
                            </p>
                        </div>
                    `
                }).catch(mailErr => console.error('[NOTIFICATION SERVICE] SMTP send failure:', mailErr));
            }
        } catch (userErr) {
            console.error('[NOTIFICATION SERVICE] Failed to fetch user details for email dispatch:', userErr);
        }

        return notification;
    } catch (error) {
        console.error(`[NOTIFICATION SERVICE] Failed to dispatch notification: ${error.message}`);
        return null;
    }
};

module.exports = {
    createNotification
};
