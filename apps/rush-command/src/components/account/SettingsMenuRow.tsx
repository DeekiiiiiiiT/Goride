import { MaterialIcon } from '../../signup/components/MaterialIcon';

interface SettingsMenuRowProps {
  icon: string;
  label: string;
  onClick: () => void;
}

export default function SettingsMenuRow({ icon, label, onClick }: SettingsMenuRowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[64px] w-full items-center justify-between p-inset-md text-left transition-colors hover:bg-surface-container-low active:bg-surface-container-high"
    >
      <div className="flex items-center gap-inset-md">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-container text-primary">
          <MaterialIcon name={icon} />
        </div>
        <span className="text-body-lg text-on-surface">{label}</span>
      </div>
      <MaterialIcon name="chevron_right" className="text-outline" />
    </button>
  );
}
