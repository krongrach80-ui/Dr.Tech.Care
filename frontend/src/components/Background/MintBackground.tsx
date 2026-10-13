import React from 'react';

export const MintBackground: React.FC = () => {
  return (
    <div
      className="fixed inset-0 w-full h-full pointer-events-none overflow-hidden z-0"
      aria-hidden="true"
    >
      {/* Top-Right Ambient Soft Mint Blurred Circle */}
      <div
        className="absolute -top-[60px] -right-[60px] w-[clamp(220px,35vw,420px)] h-[clamp(220px,35vw,420px)] rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(47, 179, 154, 0.20) 0%, rgba(232, 248, 241, 0.02) 70%)',
          filter: 'blur(40px)',
        }}
      />

      {/* Bottom-Left Ambient Soft Blue Blurred Circle */}
      <div
        className="absolute -bottom-[80px] -left-[80px] w-[clamp(260px,40vw,480px)] h-[clamp(260px,40vw,480px)] rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(56, 148, 244, 0.18) 0%, rgba(228, 240, 252, 0.02) 75%)',
          filter: 'blur(45px)',
        }}
      />

      {/* Center Subtle Light Glow */}
      <div
        className="absolute top-[35%] left-[18%] w-[clamp(220px,32vw,400px)] h-[clamp(220px,32vw,400px)] rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(255, 255, 255, 0.65) 0%, rgba(255, 255, 255, 0) 70%)',
          filter: 'blur(50px)',
        }}
      />

      {/* Top-Right Subtle Dot Pattern (Mint) */}
      <div
        className="absolute top-4 right-4 w-[clamp(90px,14vw,160px)] h-[clamp(90px,14vw,160px)]"
        style={{
          backgroundImage: 'radial-gradient(#1E8A4C 1.5px, transparent 1.5px)',
          backgroundSize: '14px 14px',
          opacity: 0.15,
        }}
      />

      {/* Bottom-Left Subtle Dot Pattern (Soft Navy/Blue) */}
      <div
        className="absolute bottom-4 left-4 w-[clamp(90px,14vw,160px)] h-[clamp(90px,14vw,160px)]"
        style={{
          backgroundImage: 'radial-gradient(#1F3A4D 1.5px, transparent 1.5px)',
          backgroundSize: '14px 14px',
          opacity: 0.14,
        }}
      />

      {/* Multi-layered Translucent Curved Waves (SVG vector) */}
      <svg
        className="absolute bottom-0 left-0 w-full h-full opacity-60"
        viewBox="0 0 1440 900"
        fill="none"
        preserveAspectRatio="none"
      >
        <path
          d="M-60 620C280 540 520 720 860 630C1160 550 1340 680 1500 640V960H-60V620Z"
          fill="rgba(255, 255, 255, 0.55)"
        />
        <path
          d="M-80 690C240 610 560 770 940 690C1220 630 1380 740 1520 720V960H-80V690Z"
          fill="rgba(228, 240, 252, 0.50)"
        />
        <path
          d="M-40 760C320 680 640 820 1020 750C1280 700 1400 790 1520 800V960H-40V760Z"
          fill="rgba(47, 179, 154, 0.08)"
        />
      </svg>
    </div>
  );
};
