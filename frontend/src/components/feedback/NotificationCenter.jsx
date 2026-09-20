import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { bindNotificationHandlers } from './notificationService';

const toastStyles = {
    success: { Icon: CheckCircle2, accent: 'text-emerald-700', border: 'border-emerald-300', surface: 'bg-emerald-50', text: 'text-emerald-900' },
    error: { Icon: XCircle, accent: 'text-rose-600', border: 'border-rose-200' },
    warning: { Icon: AlertTriangle, accent: 'text-amber-600', border: 'border-amber-200' },
    info: { Icon: Info, accent: 'text-[var(--primary)]', border: 'border-[#cbd0dd]' }
};

const NotificationCenter = () => {
    const [notifications, setNotifications] = useState([]);
    const [confirmation, setConfirmation] = useState(null);
    const [promptRequest, setPromptRequest] = useState(null);
    const [promptValue, setPromptValue] = useState('');

    useEffect(() => {
        return bindNotificationHandlers({
            onNotification: (notification) => {
                setNotifications((current) => [...current.slice(-3), notification]);
                window.setTimeout(() => {
                    setNotifications((current) => current.filter((item) => item.id !== notification.id));
                }, 4500);
            },
            onConfirmation: setConfirmation,
            onPrompt: (request) => {
                setPromptValue(request.defaultValue);
                setPromptRequest(request);
            }
        });
    }, []);

    const closeConfirmation = (accepted) => {
        if (!confirmation) return;
        const { resolve } = confirmation;
        setConfirmation(null);
        resolve(accepted);
    };

    const closePrompt = (accepted) => {
        if (!promptRequest) return;
        const { resolve } = promptRequest;
        const value = promptValue.trim();
        if (accepted && promptRequest.required && !value) return;
        setPromptRequest(null);
        setPromptValue('');
        resolve(accepted ? value : null);
    };

    return (
        <>
            <div className="pointer-events-none fixed right-4 top-4 z-[180] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2" aria-live="polite">
                {notifications.map((notification) => {
                    const style = toastStyles[notification.type] || toastStyles.info;
                    return (
                        <div key={notification.id} className={`pointer-events-auto flex items-start gap-3 rounded-lg border ${style.border} ${style.surface || 'bg-white'} p-3 animate-in slide-in-from-right-3 fade-in duration-200`}>
                            <style.Icon className={`mt-0.5 shrink-0 ${style.accent}`} size={18} />
                            <p className={`min-w-0 flex-1 text-sm font-medium leading-5 ${style.text || 'text-[#31374a]'}`}>{notification.message}</p>
                            <button type="button" className="phoenix-icon-button !h-7 !w-7" onClick={() => setNotifications((current) => current.filter((item) => item.id !== notification.id))} aria-label="Dismiss notification">
                                <X size={14} />
                            </button>
                        </div>
                    );
                })}
            </div>

            {confirmation && (
                <div className="fixed inset-0 z-[190] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="confirmation-title">
                    <button type="button" className="absolute inset-0 bg-[#141824]/45" onClick={() => closeConfirmation(false)} aria-label="Cancel confirmation" />
                    <div className="relative w-full max-w-md rounded-lg border border-[#cbd0dd] bg-white">
                        <div className="flex items-start gap-3 border-b border-[#e3e6ed] p-4">
                            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${confirmation.tone === 'danger' ? 'bg-rose-50 text-rose-600' : 'bg-[var(--primary-soft)] text-[var(--primary)]'}`}>
                                <AlertTriangle size={18} />
                            </div>
                            <div className="min-w-0 flex-1">
                                <h2 id="confirmation-title" className="text-base font-semibold text-[#141824]">{confirmation.title}</h2>
                                <p className="mt-1 text-sm leading-5 text-[#525b75]">{confirmation.message}</p>
                            </div>
                        </div>
                        <div className="flex justify-end gap-2 p-4">
                            <button type="button" className="phoenix-secondary-button" onClick={() => closeConfirmation(false)}>{confirmation.cancelLabel}</button>
                            <button type="button" className={confirmation.tone === 'danger' ? 'h-9 rounded-md bg-rose-600 px-4 text-sm font-semibold text-white hover:bg-rose-700' : 'phoenix-primary-button'} onClick={() => closeConfirmation(true)}>{confirmation.confirmLabel}</button>
                        </div>
                    </div>
                </div>
            )}

            {promptRequest && (
                <div className="fixed inset-0 z-[190] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="prompt-title">
                    <button type="button" className="absolute inset-0 bg-[#141824]/45" onClick={() => closePrompt(false)} aria-label="Cancel input" />
                    <div className="relative w-full max-w-md rounded-lg border border-[#cbd0dd] bg-white">
                        <div className="border-b border-[#e3e6ed] p-4">
                            <h2 id="prompt-title" className="text-base font-semibold text-[#141824]">{promptRequest.title}</h2>
                            <p className="mt-1 text-sm leading-5 text-[#525b75]">{promptRequest.message}</p>
                        </div>
                        <div className="p-4">
                            <label className="phoenix-field-label" htmlFor="notification-prompt-input">{promptRequest.label}</label>
                            {promptRequest.choices.length > 0 ? (
                                <select id="notification-prompt-input" className="phoenix-control mt-1" value={promptValue} onChange={(event) => setPromptValue(event.target.value)} autoFocus>
                                    <option value="">Select an option</option>
                                    {promptRequest.choices.map((choice) => {
                                        const value = typeof choice === 'string' ? choice : choice.value;
                                        const label = typeof choice === 'string' ? choice : choice.label;
                                        return <option key={value} value={value}>{label}</option>;
                                    })}
                                </select>
                            ) : promptRequest.multiline ? (
                                <textarea
                                    id="notification-prompt-input"
                                    className="phoenix-control mt-1 min-h-24 resize-y py-2"
                                    value={promptValue}
                                    placeholder={promptRequest.placeholder}
                                    onChange={(event) => setPromptValue(event.target.value)}
                                    autoFocus
                                />
                            ) : (
                                <input
                                    id="notification-prompt-input"
                                    type={promptRequest.inputType}
                                    className="phoenix-control mt-1"
                                    value={promptValue}
                                    placeholder={promptRequest.placeholder}
                                    onChange={(event) => setPromptValue(event.target.value)}
                                    autoFocus
                                />
                            )}
                            {promptRequest.required && !promptValue.trim() && <p className="mt-1 text-xs text-[#8a94ad]">This field is required.</p>}
                        </div>
                        <div className="flex justify-end gap-2 border-t border-[#e3e6ed] p-4">
                            <button type="button" className="phoenix-secondary-button" onClick={() => closePrompt(false)}>Cancel</button>
                            <button type="button" className="phoenix-primary-button" disabled={promptRequest.required && !promptValue.trim()} onClick={() => closePrompt(true)}>{promptRequest.confirmLabel}</button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default NotificationCenter;
