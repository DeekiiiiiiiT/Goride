interface MaterialIconProps {
  name: string;
  filled?: boolean;
  className?: string;
  size?: number;
}

export function MaterialIcon({
  name,
  filled = false,
  className = '',
  size = 24,
}: MaterialIconProps) {
  return (
    <span
      className={`material-symbols-outlined inline-flex shrink-0 items-center justify-center leading-none ${className}`}
      style={{
        fontSize: size,
        width: size,
        height: size,
        fontVariationSettings: `'FILL' ${filled ? 1 : 0}, 'wght' 400, 'GRAD' 0, 'opsz' 24`,
      }}
    >
      {name}
    </span>
  );
}
