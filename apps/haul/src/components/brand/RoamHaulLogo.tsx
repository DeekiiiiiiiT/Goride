import React from 'react';

type Props = {
  className?: string;
};

export function RoamHaulLogo({ className }: Props) {
  return (
    <svg
      viewBox="0 0 400 100"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <text
        x="50%"
        y="55%"
        textAnchor="middle"
        fontFamily="Inter, sans-serif"
        fontWeight="900"
        fontSize="32"
        fill="#F59E0B"
        letterSpacing="0.4em"
      >
        ROAM HAUL
      </text>
    </svg>
  );
}
