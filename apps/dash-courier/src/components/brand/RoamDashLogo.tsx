import React from 'react';

type RoamDashLogoProps = {
  className?: string;
};

export function RoamDashLogo({ className = 'w-full h-auto' }: RoamDashLogoProps) {
  return (
    <svg viewBox="0 0 200 60" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden>
      <path d="M25 45L35 15H42L32 45H25ZM45 45L55 15H62L52 45H45Z" fill="#10B981" />
      <text
        x="70"
        y="38"
        fontFamily="Inter, sans-serif"
        fontWeight="900"
        fontSize="28"
        fill="#1C1917"
        letterSpacing="-1"
      >
        ROAM DASH
      </text>
      <path d="M15 45H10V40H15V45ZM20 40H15V35H20V40ZM25 35H20V30H25V35Z" fill="#10B981" />
    </svg>
  );
}
