import { useEffect, useState } from 'react';
import { formatElapsedTimer } from '../../../lib/partner-utils';

interface OrderElapsedTimerProps {
  startedAt: string;
  className?: string;
}

export default function OrderElapsedTimer({ startedAt, className = '' }: OrderElapsedTimerProps) {
  const [, setTick] = useState(0);

  useEffect(() => {
    const interval = window.setInterval(() => setTick((value) => value + 1), 1000);
    return () => window.clearInterval(interval);
  }, []);

  return (
    <span className={`font-mono text-label-md font-semibold tabular-nums ${className}`}>
      {formatElapsedTimer(startedAt)}
    </span>
  );
}
