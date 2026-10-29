import React from 'react';

interface BrandCubeLogoProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const BrandCubeLogo: React.FC<BrandCubeLogoProps> = ({
  size = 'md',
  className = '',
}) => {
  const dims =
    size === 'lg'
      ? 'w-28 h-28'
      : size === 'sm'
      ? 'w-8 h-8'
      : 'w-10 h-10';

  return (
    <div className={`relative inline-flex items-center justify-center shrink-0 ${dims} ${className}`}>
      {size === 'lg' && (
        <div
          aria-hidden="true"
          className="absolute inset-1 rounded-full bg-[#10B981]/20 blur-2xl pointer-events-none"
        />
      )}
      <svg
        viewBox="0 0 120 120"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full relative z-10 drop-shadow-[0_6px_18px_rgba(16,185,129,0.28)]"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="cubeTopGrad" x1="22" y1="36" x2="98" y2="72" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#34D399" />
            <stop offset="55%" stopColor="#10B981" />
            <stop offset="100%" stopColor="#059669" />
          </linearGradient>
          <linearGradient id="cubeLeftGrad" x1="20" y1="54" x2="60" y2="104" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#10B981" />
            <stop offset="100%" stopColor="#065F46" />
          </linearGradient>
          <linearGradient id="cubeRightGrad" x1="60" y1="54" x2="100" y2="104" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#059669" />
            <stop offset="100%" stopColor="#064E3B" />
          </linearGradient>
          <linearGradient id="pinGrad" x1="60" y1="10" x2="60" y2="62" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#6EE7B7" />
            <stop offset="50%" stopColor="#22C55E" />
            <stop offset="100%" stopColor="#047857" />
          </linearGradient>
        </defs>

        {/* Isometric GIS Land Block Top Surface */}
        <polygon
          points="60,36 100,56 60,76 20,56"
          fill="url(#cubeTopGrad)"
          stroke="#A7F3D0"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />

        {/* Subtle GIS Subdivision Parcel Lines on Top Face */}
        <line x1="40" y1="46" x2="80" y2="66" stroke="#064E3B" strokeOpacity="0.45" strokeWidth="1.4" />
        <line x1="80" y1="46" x2="40" y2="66" stroke="#064E3B" strokeOpacity="0.45" strokeWidth="1.4" />
        <polygon
          points="60,43 73,49.5 60,56 47,49.5"
          fill="#6EE7B7"
          fillOpacity="0.35"
        />

        {/* Isometric Left Depth Wall */}
        <polygon
          points="20,56 60,76 60,102 20,82"
          fill="url(#cubeLeftGrad)"
          stroke="#34D399"
          strokeOpacity="0.5"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
        <line x1="20" y1="69" x2="60" y2="89" stroke="#34D399" strokeOpacity="0.3" strokeWidth="1" />

        {/* Isometric Right Depth Wall */}
        <polygon
          points="100,56 60,76 60,102 100,82"
          fill="url(#cubeRightGrad)"
          stroke="#10B981"
          strokeOpacity="0.45"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
        <line x1="100" y1="69" x2="60" y2="89" stroke="#34D399" strokeOpacity="0.25" strokeWidth="1" />

        {/* Center Pin Shadow on Cube */}
        <ellipse cx="60" cy="57" rx="9" ry="4.5" fill="#022C22" fillOpacity="0.55" />

        {/* Floating GPS Map Pin */}
        <path
          d="M60 11C49.5 11 41 19.3 41 29.6C41 42.8 57.2 54.8 59.1 56.2C59.6 56.6 60.4 56.6 60.9 56.2C62.8 54.8 79 42.8 79 29.6C79 19.3 70.5 11 60 11Z"
          fill="url(#pinGrad)"
          stroke="#D1FAE5"
          strokeWidth="1.6"
        />
        <circle cx="60" cy="29.5" r="7.5" fill="#064E3B" stroke="#A7F3D0" strokeWidth="1.5" />
        <circle cx="60" cy="29.5" r="3" fill="#6EE7B7" />
      </svg>
    </div>
  );
};
