import { QRCodeSVG } from 'qrcode.react';

interface FirstPartyQrProps {
  value: string;
  size: number;
  alt: string;
  className?: string;
}

/** Client-side QR — no third-party image CDN. */
export default function FirstPartyQr({ value, size, alt, className }: FirstPartyQrProps) {
  return (
    <div
      role="img"
      aria-label={alt}
      className={className}
      style={{ width: size, height: size }}
    >
      <QRCodeSVG value={value} size={size} level="M" includeMargin={false} />
    </div>
  );
}
