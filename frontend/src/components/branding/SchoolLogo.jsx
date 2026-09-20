import React, { useState } from 'react';
import { GraduationCap } from 'lucide-react';

const getLogoShape = (image) => {
    const ratio = image.naturalWidth / image.naturalHeight;
    if (ratio >= 2.2) return 'wide';
    if (ratio <= 0.8) return 'tall';
    return 'balanced';
};

const SchoolLogo = ({ src, name = '', alt = 'School logo', placement = 'sidebar', className = '' }) => {
    const [imageState, setImageState] = useState({ src: '', shape: 'unknown', failed: false });
    const isCurrentSource = imageState.src === src;
    const shape = isCurrentSource ? imageState.shape : 'unknown';
    const failed = isCurrentSource && imageState.failed;

    return (
        <div className={`school-logo school-logo-${placement} school-logo-${shape} ${className}`.trim()}>
            {src && !failed ? (
                <img
                    src={src}
                    alt={alt}
                    onLoad={(event) => setImageState({ src, shape: getLogoShape(event.currentTarget), failed: false })}
                    onError={() => setImageState({ src, shape: 'unknown', failed: true })}
                />
            ) : name ? (
                <span className="school-logo-name">{name}</span>
            ) : (
                <GraduationCap className="school-logo-fallback" aria-hidden="true" />
            )}
        </div>
    );
};

export default SchoolLogo;
