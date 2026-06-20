import React from 'react';

type LocationRippleShaderProps = {
  className?: string;
};

/** Animated radial ripple using the green location shader texture. */
export function LocationRippleShader({ className = '' }: LocationRippleShaderProps) {
  return (
    <div className={`absolute inset-0 flex items-center justify-center pointer-events-none ${className}`}>
      <div
        className="absolute w-full h-full courier-shader-ripple"
        style={{ backgroundImage: "url('/images/shaders/location-ripple.png')" }}
        aria-hidden
      />
      <div
        className="absolute w-full h-full courier-shader-ripple courier-shader-ripple-delay"
        style={{ backgroundImage: "url('/images/shaders/location-ripple.png')" }}
        aria-hidden
      />
    </div>
  );
}
