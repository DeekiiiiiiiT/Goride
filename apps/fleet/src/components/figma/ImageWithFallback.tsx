import React, { useState } from 'react'

const ERROR_IMG_SRC =
  'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iODgiIGhlaWdodD0iODgiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIgc3Ryb2tlPSIjMDAwIiBzdHJva2UtbGluZWpvaW49InJvdW5kIiBvcGFjaXR5PSIuMyIgZmlsbD0ibm9uZSIgc3Ryb2tlLXdpZHRoPSIzLjciPjxyZWN0IHg9IjE2IiB5PSIxNiIgd2lkdGg9IjU2IiBoZWlnaHQ9IjU2IiByeD0iNiIvPjxwYXRoIGQ9Im0xNiA1OCAxNi0xOCAzMiAzMiIvPjxjaXJjbGUgY3g9IjUzIiBjeT0iMzUiIHI9IjciLz48L3N2Zz4KCg=='

export interface ImageWithFallbackProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  /**
   * Shown when the file cannot be loaded (404/410/expired or deleted evidence). M6: a stored
   * address that no longer resolves must read as "file not available", never as an error screen.
   */
  unavailableText?: string
}

export function ImageWithFallback({ unavailableText = 'File not available', ...props }: ImageWithFallbackProps) {
  const [didError, setDidError] = useState(false)

  const handleError = () => {
    setDidError(true)
  }

  const { src, alt, style, className, ...rest } = props

  if (didError) {
    return (
      <div
        className={`inline-flex flex-col items-center justify-center gap-1 bg-gray-100 text-center align-middle text-gray-500 ${className ?? ''}`}
        style={style}
        role="img"
        aria-label={alt ? `${alt}: ${unavailableText}` : unavailableText}
        data-original-url={src}
      >
        <img src={ERROR_IMG_SRC} alt="" aria-hidden="true" className="h-10 w-10 opacity-60" />
        <span className="px-2 text-xs">{unavailableText}</span>
      </div>
    )
  }

  return <img src={src} alt={alt} className={className} style={style} {...rest} onError={handleError} />
}
