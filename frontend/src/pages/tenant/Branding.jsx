import React, { useEffect, useState } from 'react';
import {
  Palette,
  Upload,
  CheckCircle2,
  RefreshCw,
  Loader2,
  Trash2,
  Image as ImageIcon,
  Eraser,
  Undo2,
  FileImage
} from 'lucide-react';
import { useBranding } from '../../context/BrandingContext';
import { notify } from '../../components/feedback/notificationService';
import { removeSolidImageBackground } from '../../utils/imageBackground';
import { useAuth } from '../../context/AuthContext';
import { hasPermission } from '../../utils/permissions';

const colorFields = [
    {
        key: 'primaryColor',
        label: 'Primary color',
        description: 'Navigation, main actions, and selected states'
    },
    {
        key: 'secondaryColor',
        label: 'Accent color',
        description: 'Supporting highlights and secondary indicators'
    }
];

const Branding = () => {
    const { user } = useAuth();
    const { branding, updateBranding, loadBranding } = useBranding();
    const [formData, setFormData] = useState({
        primaryColor: '',
        secondaryColor: ''
    });
    const [logoFile, setLogoFile] = useState(null);
    const [originalLogoFile, setOriginalLogoFile] = useState(null);
    const [previewLogoUrl, setPreviewLogoUrl] = useState('');
    const [processingBackground, setProcessingBackground] = useState(false);
    const [backgroundRemoved, setBackgroundRemoved] = useState(false);
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);

    useEffect(() => {
        if (branding) {
            const sourceLogoUrl = branding.logoSourceUrl || branding.logoUrl || '';
            setFormData({
                primaryColor: branding.primaryColor || '#2563eb',
                secondaryColor: branding.secondaryColor || '#22c55e'
            });
            if (!logoFile) setPreviewLogoUrl(branding.logoUrl || sourceLogoUrl);
        }
    }, [branding, logoFile]);

    useEffect(() => {
        if (!logoFile) return undefined;

        let active = true;
        const reader = new FileReader();
        reader.onload = () => {
            if (active) setPreviewLogoUrl(String(reader.result || ''));
        };
        reader.readAsDataURL(logoFile);
        return () => {
            active = false;
            reader.abort();
        };
    }, [logoFile]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setSuccess(false);
        try {
            let payload;
            if (logoFile) {
                payload = new FormData();
                payload.append('primaryColor', formData.primaryColor);
                payload.append('secondaryColor', formData.secondaryColor);
                payload.append('logo', logoFile);
            } else {
                payload = {
                    primaryColor: formData.primaryColor,
                    secondaryColor: formData.secondaryColor
                };
            }

            const savedBranding = await updateBranding(payload);
            const savedLogoSource = savedBranding.logoSourceUrl || '';
            setFormData({
                primaryColor: savedBranding.primaryColor,
                secondaryColor: savedBranding.secondaryColor
            });
            setPreviewLogoUrl(savedBranding.logoUrl || savedLogoSource);
            setLogoFile(null);
            setOriginalLogoFile(null);
            setBackgroundRemoved(false);
            setSuccess(true);
            notify('School identity updated successfully.', 'success');
            setTimeout(() => setSuccess(false), 3000);
        } catch (error) {
            console.error('Failed to update branding:', error);
            const msg = error?.response?.data?.message || error?.message || 'Failed to save branding changes.';
            notify(msg, 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleReset = () => {
        loadBranding();
        setLogoFile(null);
        setOriginalLogoFile(null);
        setBackgroundRemoved(false);
        setSuccess(false);
    };

    const handleLogoSelection = (event) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const supportedTypes = ['image/png', 'image/jpeg', 'image/webp'];
        if (!supportedTypes.includes(file.type)) {
            notify('Choose a PNG, JPEG, or WebP logo.', 'error');
            event.target.value = '';
            return;
        }
        if (file.size > 2 * 1024 * 1024) {
            notify('The logo must be 2 MB or smaller.', 'error');
            event.target.value = '';
            return;
        }
        setOriginalLogoFile(file);
        setLogoFile(file);
        setBackgroundRemoved(false);
        event.target.value = '';
    };

    const handleRemoveBackground = async () => {
        if (!originalLogoFile) return;
        setProcessingBackground(true);
        try {
            const transparentLogo = await removeSolidImageBackground(originalLogoFile);
            setLogoFile(transparentLogo);
            setBackgroundRemoved(true);
            notify('Solid logo background removed. Review the preview before saving.', 'success');
        } catch (error) {
            notify(error.message || 'Could not remove the logo background.', 'error');
        } finally {
            setProcessingBackground(false);
        }
    };

    return (
        <div className="branding-compact-page">
            <div className="phoenix-page-header">
                <div>
                    <h1 className="phoenix-page-title">Branding</h1>
                    <p className="phoenix-page-subtitle">Manage the school identity used across dashboards, portals, and receipts.</p>
                </div>
                <div className="phoenix-badge">
                    <Palette size={14} className="text-[var(--primary)]" /> School-wide identity
                </div>
            </div>

            <form onSubmit={handleSubmit} className="branding-unified-form phoenix-card">
                <div className="branding-form-header">
                    <div>
                        <h2 className="phoenix-section-title">School identity</h2>
                        <p className="phoenix-section-copy">Set interface colors and the logo from one form.</p>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                        {success && (
                            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#168403]">
                                <CheckCircle2 size={14} /> Saved
                            </span>
                        )}
                        {hasPermission(user, 'tenant.branding.update') && <button type="button" onClick={handleReset} className="phoenix-secondary-button">
                            <RefreshCw size={14} /> Discard
                        </button>}
                        <button type="submit" disabled={loading} className="phoenix-primary-button disabled:opacity-50">
                            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 size={15} />}
                            Save identity
                        </button>
                    </div>
                </div>

                <div className="branding-form-grid">
                    <div className="branding-settings-column">
                    <section className="branding-form-section">
                        <div className="mb-4 flex items-center gap-2">
                            <Palette size={17} className="text-[var(--primary)]" />
                            <div>
                                <h3 className="phoenix-section-title">Interface colors</h3>
                                <p className="phoenix-section-copy">Used for navigation and actions.</p>
                            </div>
                        </div>
                        <div className="space-y-4">
                            {colorFields.map((field) => (
                                <label key={field.key} className="branding-color-field">
                                    <span className="block min-w-0 flex-1">
                                        <span className="block text-xs font-semibold text-[#31374a]">{field.label}</span>
                                        <span className="mt-0.5 block text-[11px] text-[#6e7891]">{field.description}</span>
                                    </span>
                                    <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md border border-[#cbd0dd]">
                                        <input
                                            type="color"
                                            className="absolute inset-0 h-full w-full scale-150"
                                            value={formData[field.key]}
                                            onChange={(e) => setFormData({ ...formData, [field.key]: e.target.value })}
                                        />
                                    </span>
                                    <input
                                        type="text"
                                        className="h-10 w-24 px-2 text-xs font-semibold uppercase"
                                        value={formData[field.key]}
                                        onChange={(e) => setFormData({ ...formData, [field.key]: e.target.value })}
                                        aria-label={field.label}
                                    />
                                </label>
                            ))}
                        </div>
                    </section>

                    <section className="branding-form-section">
                        <div className="mb-4 flex items-center gap-2">
                            <Upload size={17} className="text-[var(--primary)]" />
                            <div>
                                <h3 className="phoenix-section-title">School logo</h3>
                                <p className="phoenix-section-copy">Upload the logo used across navigation and receipts.</p>
                            </div>
                        </div>

                        <label className="branding-upload-field">
                            <span className="branding-upload-icon" aria-hidden="true">
                                <FileImage size={22} />
                            </span>
                            <span className="max-w-full truncate text-sm font-semibold text-[#31374a]">
                                {logoFile ? logoFile.name : (previewLogoUrl ? 'Replace school logo' : 'Upload school logo')}
                            </span>
                            <span className="text-center text-xs text-[#6e7891]">
                                Click to choose a PNG, JPEG, or WebP file up to 2 MB
                            </span>
                            <input
                                type="file"
                                accept="image/png,image/jpeg,image/webp"
                                className="sr-only"
                                onChange={handleLogoSelection}
                                aria-label={previewLogoUrl ? 'Replace school logo' : 'Upload school logo'}
                            />
                        </label>

                        {logoFile && (
                            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                                {!backgroundRemoved && originalLogoFile?.type !== 'image/svg+xml' && (
                                    <button
                                        type="button"
                                        onClick={handleRemoveBackground}
                                        disabled={processingBackground}
                                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--secondary)] disabled:opacity-50"
                                    >
                                        {processingBackground ? <Loader2 size={13} className="animate-spin" /> : <Eraser size={13} />}
                                        Remove solid background
                                    </button>
                                )}
                                {backgroundRemoved && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setLogoFile(originalLogoFile);
                                            setBackgroundRemoved(false);
                                        }}
                                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--secondary)]"
                                    >
                                        <Undo2 size={13} /> Restore original
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={() => {
                                        setLogoFile(null);
                                        setOriginalLogoFile(null);
                                        setBackgroundRemoved(false);
                                        setPreviewLogoUrl(branding.logoUrl || branding.logoSourceUrl || '');
                                    }}
                                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#e63757]"
                                >
                                    <Trash2 size={13} /> Remove selected file
                                </button>
                            </div>
                        )}

                    </section>
                    </div>

                    <section className="branding-form-section branding-preview-section">
                        <div className="mb-4 flex items-center gap-2">
                            <ImageIcon size={17} className="text-[var(--primary)]" />
                            <div>
                                <h3 className="phoenix-section-title">Logo preview</h3>
                                <p className="phoenix-section-copy">Displayed in school navigation.</p>
                            </div>
                        </div>
                        <div className="branding-logo-preview">
                            {previewLogoUrl ? (
                                <img src={previewLogoUrl} alt="Logo preview" className="branding-logo-preview-image" />
                            ) : (
                                <div className="flex flex-col items-center gap-2 text-[#8a94ad]">
                                    <ImageIcon size={28} />
                                    <span className="text-xs font-semibold">No logo selected</span>
                                </div>
                            )}
                        </div>
                        <div className="branding-preview-note">
                            <CheckCircle2 size={14} aria-hidden="true" />
                            <span>The preview keeps the logo proportions and never exposes its storage path.</span>
                        </div>
                    </section>
                </div>
            </form>
        </div>
    );
};

export default Branding;
