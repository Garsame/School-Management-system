export const escapeHtml = (value) => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

export const formatPrintDate = (value) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString();
};

const sanitizeFilename = (value) => String(value || 'document')
    .trim()
    .replace(/[^a-z0-9._-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'document';

const safeCssColor = (value, fallback) => (
    /^#[0-9a-f]{3,8}$/i.test(String(value || '').trim())
        ? String(value).trim()
        : fallback
);

const buildDocumentHtml = ({ title, body, primaryColor = '#2563eb', secondaryColor = '#22c55e' }) => `<!doctype html>
<html>
<head>
  <title>${escapeHtml(title)}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
    :root { --doc-primary: ${safeCssColor(primaryColor, '#2563eb')}; --doc-secondary: ${safeCssColor(secondaryColor, '#22c55e')}; }
    * { box-sizing: border-box; }
    body { margin: 0; padding: 32px; color: #141824; font-family: 'Plus Jakarta Sans', system-ui, sans-serif; background: #f5f7fa; }
    .doc { max-width: 940px; margin: 0 auto; border: 1px solid #d8dde8; padding: 30px; background: #fff; }
    .header { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; border-bottom: 3px solid var(--doc-primary); padding-bottom: 18px; margin-bottom: 24px; }
    .school-mark { display: flex; align-items: center; gap: 14px; }
    .logo { width: 78px; height: 78px; object-fit: contain; }
    .doc-title { text-align: right; }
    h1 { margin: 0; font-size: 24px; color: #0f172a; }
    h2 { margin: 22px 0 10px; font-size: 13px; text-transform: uppercase; letter-spacing: .08em; color: var(--doc-primary); }
    p { margin: 4px 0; line-height: 1.45; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    th, td { border: 1px solid #d8dde8; padding: 9px; text-align: left; font-size: 13px; vertical-align: top; }
    th { background: #f5f7fa; text-transform: uppercase; font-size: 11px; color: #525b75; }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px 24px; }
    .label { color: #6e7891; font-size: 11px; text-transform: uppercase; font-weight: 700; letter-spacing: .04em; }
    .value { font-size: 14px; font-weight: 700; color: #0f172a; }
    .summary { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin: 18px 0; }
    .box { border: 1px solid #d8dde8; border-top: 3px solid var(--doc-secondary); padding: 12px; background: #f8fafc; min-height: 68px; }
    .signature-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 22px; margin-top: 34px; }
    .signature-line { border-top: 1px solid #9aa4b8; padding-top: 8px; color: #525b75; font-size: 11px; font-weight: 700; text-transform: uppercase; }
    .footer { margin-top: 28px; padding-top: 16px; border-top: 1px solid #d8dde8; font-size: 11px; color: #6e7891; display: flex; justify-content: space-between; gap: 12px; }
    .watermark { color: #8a94ad; font-size: 11px; text-transform: uppercase; letter-spacing: .08em; }
    @page { margin: 16mm; }
    @media print {
      body { padding: 0; background: #fff; }
      .doc { border: 0; padding: 0; }
    }
  </style>
</head>
<body>${body}</body>
</html>`;

export const printHtmlDocument = ({ title, body, primaryColor, secondaryColor }) => {
    const win = window.open('', '_blank', 'width=900,height=700');
    if (!win) return false;
    win.opener = null;
    win.document.write(buildDocumentHtml({ title, body, primaryColor, secondaryColor }));
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 250);
    return true;
};

export const downloadHtmlDocument = ({ title, body, filename, primaryColor, secondaryColor }) => {
    const html = buildDocumentHtml({ title, body, primaryColor, secondaryColor });
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${sanitizeFilename(filename || title)}.html`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
};

export const documentHeader = ({ schoolName, schoolAddress, schoolPhone, schoolEmail, logoUrl, title, subtitle }) => `
    <div class="header">
        <div class="school-mark">
            ${logoUrl ? `<img class="logo" src="${escapeHtml(logoUrl)}" alt="School logo" />` : ''}
            <div>
                <h1>${escapeHtml(schoolName || 'School Document')}</h1>
                ${schoolAddress ? `<p>${escapeHtml(schoolAddress)}</p>` : ''}
                ${(schoolPhone || schoolEmail) ? `<p>${escapeHtml([schoolPhone, schoolEmail].filter(Boolean).join(' | '))}</p>` : ''}
            </div>
        </div>
        <div class="doc-title">
            <p class="watermark">${escapeHtml(title || 'Official Record')}</p>
            ${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ''}
        </div>
    </div>`;

export const signatureBlock = () => `
    <div class="signature-grid">
        <div class="signature-line">Class Teacher</div>
        <div class="signature-line">Registrar</div>
        <div class="signature-line">Principal / Head</div>
    </div>`;
