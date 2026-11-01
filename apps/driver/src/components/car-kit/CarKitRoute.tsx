import { CarKitPage } from './CarKitPage';
import './car-kit.css';

export function CarKitRoute({ onBack }: { onBack?: () => void }) {
  return (
    <div className="driver-car-kit-stitch min-h-screen bg-surface">
      <CarKitPage onBack={onBack} />
    </div>
  );
}
