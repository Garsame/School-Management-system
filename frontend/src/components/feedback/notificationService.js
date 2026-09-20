let notificationSubscriber = null;
let confirmationSubscriber = null;
let promptSubscriber = null;
const recentNotifications = new Map();

export const notify = (message, type = 'info') => {
    if (!message || !notificationSubscriber) return;
    const normalizedMessage = String(message);
    const key = `${type}:${normalizedMessage}`;
    const now = Date.now();
    const previous = recentNotifications.get(key) || 0;
    if (now - previous < 2000) return;
    recentNotifications.set(key, now);
    for (const [notificationKey, createdAt] of recentNotifications) {
        if (now - createdAt > 10000) recentNotifications.delete(notificationKey);
    }
    notificationSubscriber({ id: `${now}-${Math.random()}`, message: normalizedMessage, type });
};

export const confirmAction = (message, options = {}) => new Promise((resolve) => {
    if (!confirmationSubscriber) {
        resolve(false);
        return;
    }
    confirmationSubscriber({
        message,
        title: options.title || 'Confirm action',
        confirmLabel: options.confirmLabel || 'Confirm',
        cancelLabel: options.cancelLabel || 'Cancel',
        tone: options.tone || 'danger',
        resolve
    });
});

export const promptAction = (message, options = {}) => new Promise((resolve) => {
    if (!promptSubscriber) {
        resolve(null);
        return;
    }
    promptSubscriber({
        message,
        title: options.title || 'Additional details',
        label: options.label || 'Reason',
        placeholder: options.placeholder || '',
        confirmLabel: options.confirmLabel || 'Continue',
        required: options.required || false,
        defaultValue: options.defaultValue || '',
        choices: options.choices || [],
        inputType: options.inputType || 'text',
        multiline: options.multiline ?? true,
        resolve
    });
});

export const bindNotificationHandlers = ({ onNotification, onConfirmation, onPrompt }) => {
    notificationSubscriber = onNotification;
    confirmationSubscriber = onConfirmation;
    promptSubscriber = onPrompt;
    return () => {
        notificationSubscriber = null;
        confirmationSubscriber = null;
        promptSubscriber = null;
    };
};
