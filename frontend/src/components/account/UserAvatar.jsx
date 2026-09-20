import React, { useState } from 'react';
import { User } from 'lucide-react';
import { resolveAvatarUrl } from '../../utils/avatar';

const UserAvatar = ({ user, size = 'md', className = '' }) => {
    const avatarUrl = resolveAvatarUrl(user?.avatarUrl, user?.avatarVersion || '');
    const [failedUrl, setFailedUrl] = useState('');
    const initial = String(user?.name || '').trim().charAt(0).toUpperCase();
    const dimensions = size === 'lg' ? 'h-24 w-24' : 'h-9 w-9';
    const textSize = size === 'lg' ? 'text-2xl' : 'text-sm';

    return (
        <span className={`inline-flex shrink-0 overflow-hidden rounded-full border border-[#cbd0dd] bg-[#f5f7fa] ${dimensions} ${className}`}>
            {avatarUrl && failedUrl !== avatarUrl ? (
                <img src={avatarUrl} alt={`${user?.name || 'User'} profile`} className="h-full w-full object-cover" onError={() => setFailedUrl(avatarUrl)} />
            ) : (
                <span className={`flex h-full w-full items-center justify-center font-semibold text-[#525b75] ${textSize}`}>
                    {initial || <User size={size === 'lg' ? 28 : 17} />}
                </span>
            )}
        </span>
    );
};

export default UserAvatar;
