import React from 'react';

// Ikon som ligner Rituals Perfume Genie 2.0: en lav, avrundet beholder som smalner
// litt nedover, perforert topp og duft som stiger opp. Samme prop-grensesnitt som
// Lucide-ikoner (size, strokeWidth, color) så den kan brukes som device.LucideIcon.
const DiffuserIcon = ({ size = 24, strokeWidth = 2, color = 'currentColor', className, style, ...rest }) => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        style={style}
        {...rest}
    >
        {/* Duft som stiger: én myk bølge over midten */}
        <path d="M12 5.5c-1.3-1 .9-1.9-.4-3.5" opacity="0.5" />
        {/* Beholder: avrundet sylinder (Perfume Genie), sett litt ovenfra */}
        <path d="M5.5 10v8a3 3 0 0 0 3 3h7a3 3 0 0 0 3-3v-8" />
        <ellipse cx="12" cy="10" rx="6.5" ry="2.6" />
        {/* Perforert topp */}
        <circle cx="9.6" cy="9.8" r="0.45" fill={color} stroke="none" />
        <circle cx="12" cy="9.2" r="0.45" fill={color} stroke="none" />
        <circle cx="14.4" cy="9.8" r="0.45" fill={color} stroke="none" />
        <circle cx="12" cy="10.9" r="0.45" fill={color} stroke="none" />
    </svg>
);

export default DiffuserIcon;
