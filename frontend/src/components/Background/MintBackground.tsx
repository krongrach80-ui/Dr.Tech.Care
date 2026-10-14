import React from 'react';

export const MintBackground: React.FC = () => {
  return (
    <div
      className="fixed inset-0 w-full h-full pointer-events-none overflow-hidden z-0"
      aria-hidden="true"
    >
      {/* Top-Right Ambient Soft Mint/Emerald Glow */}
      <div
        className="absolute -top-[70px] -right-[70px] w-[clamp(260px,38vw,480px)] h-[clamp(260px,38vw,480px)] rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(16, 185, 129, 0.24) 0%, rgba(230, 251, 242, 0.02) 70%)',
          filter: 'blur(45px)',
        }}
      />

      {/* Bottom-Left Ambient Soft Cyan/Royal Blue Glow */}
      <div
        className="absolute -bottom-[90px] -left-[90px] w-[clamp(280px,42vw,520px)] h-[clamp(280px,42vw,520px)] rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(37, 99, 235, 0.22) 0%, rgba(224, 242, 254, 0.02) 75%)',
          filter: 'blur(50px)',
        }}
      />

      {/* Center Subtle Pure White Luminous Glow */}
      <div
        className="absolute top-[32%] left-[16%] w-[clamp(240px,34vw,440px)] h-[clamp(240px,34vw,440px)] rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(255, 255, 255, 0.85) 0%, rgba(255, 255, 255, 0) 70%)',
          filter: 'blur(45px)',
        }}
      />

      {/* Top-Right Subtle Dot Pattern (Emerald) */}
      <div
        className="absolute top-4 right-4 w-[clamp(90px,14vw,160px)] h-[clamp(90px,14vw,160px)]"
        style={{
          backgroundImage: 'radial-gradient(#10B981 1.5px, transparent 1.5px)',
          backgroundSize: '14px 14px',
          opacity: 0.18,
        }}
      />

      {/* Bottom-Left Subtle Dot Pattern (Ocean Blue) */}
      <div
        className="absolute bottom-4 left-4 w-[clamp(90px,14vw,160px)] h-[clamp(90px,14vw,160px)]"
        style={{
          backgroundImage: 'radial-gradient(#2563EB 1.5px, transparent 1.5px)',
          backgroundSize: '14px 14px',
          opacity: 0.16,
        }}
      />

      {/* Multi-layered Translucent Curved Waves (Green - White - Blue) */}
      <svg
        className="absolute bottom-0 left-0 w-full h-full opacity-70"
        viewBox="0 0 1440 900"
        fill="none"
        preserveAspectRatio="none"
      >
        <path
          d="M-60 620C280 540 520 720 860 630C1160 550 1340 680 1500 640V960H-60V620Z"
          fill="rgba(255, 255, 255, 0.65)"
        />
        <path
          d="M-80 690C240 610 560 770 940 690C1220 630 1380 740 1520 720V960H-80V690Z"
          fill="rgba(224, 242, 254, 0.60)"
        />
        <path
          d="M-40 760C320 680 640 820 1020 750C1280 700 1400 790 1520 800V960H-40V760Z"
          fill="rgba(16, 185, 129, 0.12)"
        />
      </svg>
    </div>
  );
};
