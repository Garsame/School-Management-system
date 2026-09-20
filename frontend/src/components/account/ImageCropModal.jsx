import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Crop, LoaderCircle, RotateCcw, X, ZoomIn, ZoomOut } from 'lucide-react';

const OUTPUT_SIZE = 512;
const VIEWPORT_SIZE = 260;

const ImageCropModal = ({ sourceUrl, fileName = 'profile-image', onCancel, onConfirm }) => {
    const imageRef = useRef(null);
    const dragRef = useRef(null);
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
    const [zoom, setZoom] = useState(1);
    const [offset, setOffset] = useState({ x: 0, y: 0 });
    const [saving, setSaving] = useState(false);

    const baseScale = useMemo(() => dimensions.width && dimensions.height
        ? Math.max(VIEWPORT_SIZE / dimensions.width, VIEWPORT_SIZE / dimensions.height)
        : 1, [dimensions]);
    const displayedSize = useMemo(() => ({
        width: dimensions.width * baseScale * zoom,
        height: dimensions.height * baseScale * zoom
    }), [baseScale, dimensions, zoom]);
    const clampOffset = useCallback((next) => ({
        x: Math.max(-(displayedSize.width - VIEWPORT_SIZE) / 2, Math.min((displayedSize.width - VIEWPORT_SIZE) / 2, next.x)),
        y: Math.max(-(displayedSize.height - VIEWPORT_SIZE) / 2, Math.min((displayedSize.height - VIEWPORT_SIZE) / 2, next.y))
    }), [displayedSize]);

    useEffect(() => setOffset((current) => clampOffset(current)), [clampOffset]);
    useEffect(() => {
        const closeOnEscape = (event) => event.key === 'Escape' && !saving && onCancel();
        document.addEventListener('keydown', closeOnEscape);
        return () => document.removeEventListener('keydown', closeOnEscape);
    }, [onCancel, saving]);

    const startDragging = (event) => {
        if (saving) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, offset };
    };
    const moveImage = (event) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;
        setOffset(clampOffset({ x: drag.offset.x + event.clientX - drag.x, y: drag.offset.y + event.clientY - drag.y }));
    };
    const stopDragging = (event) => {
        if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
    };
    const moveWithKeyboard = (event) => {
        const movement = event.shiftKey ? 20 : 6;
        const delta = {
            ArrowLeft: { x: -movement, y: 0 },
            ArrowRight: { x: movement, y: 0 },
            ArrowUp: { x: 0, y: -movement },
            ArrowDown: { x: 0, y: movement }
        }[event.key];
        if (!delta) return;
        event.preventDefault();
        setOffset((current) => clampOffset({ x: current.x + delta.x, y: current.y + delta.y }));
    };

    const createCrop = async () => {
        const image = imageRef.current;
        if (!image?.naturalWidth || !image?.naturalHeight) return;
        setSaving(true);
        try {
            const canvas = document.createElement('canvas');
            canvas.width = OUTPUT_SIZE;
            canvas.height = OUTPUT_SIZE;
            const context = canvas.getContext('2d');
            const renderedScale = baseScale * zoom;
            const cropSize = VIEWPORT_SIZE / renderedScale;
            const centerX = image.naturalWidth / 2 - offset.x / renderedScale;
            const centerY = image.naturalHeight / 2 - offset.y / renderedScale;
            context.drawImage(image, centerX - cropSize / 2, centerY - cropSize / 2, cropSize, cropSize, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
            const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
            if (!blob) throw new Error('Could not crop this image.');
            const safeName = fileName.replace(/\.[^.]+$/, '') || 'profile-image';
            await onConfirm(new File([blob], `${safeName}-cropped.jpg`, { type: 'image/jpeg' }));
        } finally {
            setSaving(false);
        }
    };

    const imageStyle = dimensions.width ? {
        width: dimensions.width * baseScale,
        height: dimensions.height * baseScale,
        transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px) scale(${zoom})`
    } : { width: '100%', height: '100%', transform: 'translate(-50%, -50%)' };

    return (
        <div className="fixed inset-0 z-[195] flex items-center justify-center overflow-y-auto bg-[#141824]/55 p-3 sm:p-5" role="dialog" aria-modal="true" aria-labelledby="crop-image-title">
            <button type="button" className="absolute inset-0" onClick={onCancel} aria-label="Cancel image cropping" disabled={saving} />
            <section className="relative my-auto flex max-h-[calc(100dvh-1.5rem)] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-[#cbd0dd] bg-white shadow-xl sm:max-h-[calc(100dvh-2.5rem)]">
                <header className="flex shrink-0 items-start gap-3 border-b border-[#e3e6ed] px-4 py-3.5 sm:px-5">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--primary-soft)] text-[var(--primary)]" aria-hidden="true"><Crop size={19} /></span>
                    <div className="min-w-0 flex-1"><h2 id="crop-image-title" className="text-base font-semibold text-[#141824] sm:text-lg">Crop profile image</h2><p className="mt-0.5 text-xs text-[#6e7891] sm:text-sm">Drag the image to position it inside the frame.</p></div>
                    <button type="button" className="phoenix-icon-button shrink-0" onClick={onCancel} disabled={saving} aria-label="Close crop dialog"><X size={16} /></button>
                </header>

                <div className="min-h-0 flex-1 overflow-y-auto bg-[#f7f8fb] p-4 sm:p-5">
                    <div className="relative mx-auto aspect-square w-[260px] max-w-full touch-none cursor-grab overflow-hidden rounded-lg bg-[#dfe3eb] shadow-inner outline-none ring-[var(--primary)] focus-visible:ring-2 active:cursor-grabbing" role="application" tabIndex="0" onKeyDown={moveWithKeyboard} onPointerDown={startDragging} onPointerMove={moveImage} onPointerUp={stopDragging} onPointerCancel={stopDragging} aria-label="Reposition profile image. Drag, or use arrow keys.">
                        <img ref={imageRef} src={sourceUrl} alt="Profile crop preview" draggable="false" onLoad={(event) => setDimensions({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })} className="pointer-events-none absolute left-1/2 top-1/2 max-w-none select-none" style={imageStyle} />
                        <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3 opacity-50">{Array.from({ length: 9 }, (_, index) => <span key={index} className="border border-white/60" />)}</div>
                        <div className="pointer-events-none absolute inset-0 rounded-full border-2 border-white shadow-[0_0_0_100vmax_rgba(20,24,36,0.42)]" />
                    </div>

                    <div className="mx-auto mt-4 max-w-md rounded-lg border border-[#e3e6ed] bg-white p-3.5">
                        <div className="flex items-center gap-3">
                            <ZoomOut size={16} className="shrink-0 text-[#6e7891]" aria-hidden="true" />
                            <label className="sr-only" htmlFor="profile-crop-zoom">Image zoom</label>
                            <input id="profile-crop-zoom" className="w-full accent-[var(--primary)]" type="range" min="1" max="3" step="0.01" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} />
                            <ZoomIn size={16} className="shrink-0 text-[#6e7891]" aria-hidden="true" />
                            <span className="w-12 text-right text-xs font-semibold tabular-nums text-[#525b75]">{Math.round(zoom * 100)}%</span>
                        </div>
                        <button type="button" onClick={() => { setZoom(1); setOffset({ x: 0, y: 0 }); }} className="mt-3 inline-flex min-h-9 items-center gap-1.5 text-xs font-semibold text-[var(--primary)]" disabled={saving}><RotateCcw size={14} /> Reset crop</button>
                    </div>
                </div>

                <footer className="flex shrink-0 justify-end gap-2 border-t border-[#e3e6ed] bg-white p-3.5 sm:px-5">
                    <button type="button" className="phoenix-secondary-button" onClick={onCancel} disabled={saving}>Cancel</button>
                    <button type="button" className="phoenix-primary-button" onClick={createCrop} disabled={saving || !dimensions.width}>{saving ? <LoaderCircle className="animate-spin" size={16} /> : <Crop size={16} />}{saving ? 'Saving...' : 'Save crop'}</button>
                </footer>
            </section>
        </div>
    );
};

export default ImageCropModal;
