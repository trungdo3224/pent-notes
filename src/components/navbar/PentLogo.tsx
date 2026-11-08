import React from "react";

interface PentLogoProps {
  size?: number;
  className?: string;
  showTile?: boolean;
}

export const PentLogo: React.FC<PentLogoProps> = ({
  size = 18,
  className = "",
  showTile = false,
}) => {
  const uniqueId = React.useId().replace(/:/g, "");

  const bgGradId = `pent-bg-${uniqueId}`;
  const borderGradId = `pent-border-${uniqueId}`;
  const leftFacetId = `pent-left-${uniqueId}`;
  const rightFacetId = `pent-right-${uniqueId}`;
  const crownFacetId = `pent-crown-${uniqueId}`;
  const coreLeftId = `pent-core-l-${uniqueId}`;
  const coreRightId = `pent-core-r-${uniqueId}`;
  const breatherHaloId = `pent-breather-${uniqueId}`;

  const viewBox = showTile ? "0 0 512 512" : "100 70 312 352";

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={viewBox}
      width={size}
      height={size}
      className={className}
      fill="none"
      aria-label="PentNotes Logo"
      role="img"
    >
      <defs>
        {showTile && (
          <>
            <linearGradient id={bgGradId} x1="10%" y1="5%" x2="90%" y2="95%">
              <stop offset="0%" stop-color="#1e2638" />
              <stop offset="50%" stop-color="#111622" />
              <stop offset="100%" stop-color="#090d15" />
            </linearGradient>
            <linearGradient
              id={borderGradId}
              x1="0%"
              y1="0%"
              x2="100%"
              y2="100%"
            >
              <stop offset="0%" stop-color="#38bdf8" stopOpacity="0.45" />
              <stop offset="40%" stop-color="#34d399" stopOpacity="0.3" />
              <stop offset="100%" stop-color="#1e293b" stopOpacity="0.2" />
            </linearGradient>
          </>
        )}

        <linearGradient
          id={leftFacetId}
          x1="116"
          y1="210"
          x2="256"
          y2="412"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#34d399" />
          <stop offset="35%" stopColor="#10b981" />
          <stop offset="80%" stopColor="#059669" />
          <stop offset="100%" stopColor="#047857" />
        </linearGradient>

        <linearGradient
          id={rightFacetId}
          x1="396"
          y1="210"
          x2="256"
          y2="412"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="35%" stopColor="#06b6d4" />
          <stop offset="80%" stopColor="#0284c7" />
          <stop offset="100%" stopColor="#1d4ed8" />
        </linearGradient>

        <linearGradient
          id={crownFacetId}
          x1="156"
          y1="116"
          x2="356"
          y2="176"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#6ee7b7" />
          <stop offset="50%" stopColor="#2dd4bf" />
          <stop offset="100%" stopColor="#38bdf8" />
        </linearGradient>

        <linearGradient
          id={coreLeftId}
          x1="256"
          y1="176"
          x2="190"
          y2="290"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#a7f3d0" stopOpacity="0.9" />
          <stop offset="50%" stopColor="#34d399" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#059669" stopOpacity="0.25" />
        </linearGradient>

        <linearGradient
          id={coreRightId}
          x1="256"
          y1="176"
          x2="322"
          y2="290"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#bae6fd" stopOpacity="0.9" />
          <stop offset="50%" stopColor="#38bdf8" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#0284c7" stopOpacity="0.25" />
        </linearGradient>

        <radialGradient
          id={breatherHaloId}
          cx="256"
          cy="256"
          r="60"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="45%" stopColor="#67e8f9" stopOpacity="0.75" />
          <stop offset="75%" stopColor="#10b981" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
        </radialGradient>
      </defs>

      {showTile && (
        <rect
          x="32"
          y="32"
          width="448"
          height="448"
          rx="104"
          fill={`url(#${bgGradId})`}
          stroke={`url(#${borderGradId})`}
          strokeWidth="3"
        />
      )}

      {/* Note Accent Lines */}
      <path
        d="M 176 96 L 336 96"
        stroke="#38bdf8"
        strokeWidth="3.5"
        strokeLinecap="round"
        opacity="0.5"
      />
      <path
        d="M 216 80 L 296 80"
        stroke="#34d399"
        strokeWidth="3"
        strokeLinecap="round"
        opacity="0.35"
      />

      {/* Nib Outer Facets */}
      <path
        d="M 156 116 L 256 176 L 256 256 L 256 412 L 116 210 Z"
        fill={`url(#${leftFacetId})`}
      />
      <path
        d="M 356 116 L 256 176 L 256 256 L 256 412 L 396 210 Z"
        fill={`url(#${rightFacetId})`}
      />

      {/* Crown Top Facet */}
      <polygon
        points="156,116 356,116 256,176"
        fill={`url(#${crownFacetId})`}
      />

      {/* Inner 3D Facets */}
      <polygon
        points="156,116 256,176 198,256 116,210"
        fill={`url(#${coreLeftId})`}
      />
      <polygon
        points="356,116 256,176 314,256 396,210"
        fill={`url(#${coreRightId})`}
      />

      {/* Breather Halo & Opening */}
      <circle cx="256" cy="256" r="32" fill={`url(#${breatherHaloId})`} />
      <polygon
        points="256,236 270,256 256,276 242,256"
        fill="#0c111a"
        stroke="#67e8f9"
        strokeWidth="2.5"
      />

      {/* Precision Slit */}
      <line
        x1="256"
        y1="276"
        x2="256"
        y2="412"
        stroke="#090d15"
        strokeWidth="4.5"
        strokeLinecap="round"
      />
      <line
        x1="256"
        y1="276"
        x2="256"
        y2="412"
        stroke="#67e8f9"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.75"
      />

      {/* Ridge Highlights */}
      <line
        x1="116"
        y1="210"
        x2="256"
        y2="412"
        stroke="#a7f3d0"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.5"
      />
      <line
        x1="396"
        y1="210"
        x2="256"
        y2="412"
        stroke="#bae6fd"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.5"
      />
      <line
        x1="156"
        y1="116"
        x2="356"
        y2="116"
        stroke="#ffffff"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.65"
      />
    </svg>
  );
};
