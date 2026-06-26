import { useState } from 'react';
import JobStationPicker from '../shared/JobStationPicker';
import type { JobStation } from '../../../types/team';

interface AddFloorStaffFormProps {
  onSubmit: (payload: { name: string; jobStation: JobStation }) => void;
  isSaving?: boolean;
}

const inputClass =
  'h-12 w-full rounded-lg border border-outline-variant bg-transparent px-4 text-body-lg text-on-background outline-none transition-colors placeholder:text-on-surface-variant/50 focus:border-primary-container focus:ring-1 focus:ring-primary-container';

export default function AddFloorStaffForm({ onSubmit, isSaving = false }: AddFloorStaffFormProps) {
  const [name, setName] = useState('');
  const [jobStation, setJobStation] = useState<JobStation>('counter');

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onSubmit({ name: trimmed, jobStation });
    setName('');
    setJobStation('counter');
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-inset-md rounded-lg border border-outline-variant bg-surface-container-lowest p-inset-md shadow-sm">
      <h3 className="text-headline-md font-bold text-on-background">Add floor staff</h3>

      <div className="space-y-inset-xs">
        <label className="block text-label-md text-on-surface-variant" htmlFor="floor-staff-name">
          Full name
        </label>
        <input
          id="floor-staff-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Staff name"
          className={inputClass}
        />
      </div>

      <JobStationPicker
        value={jobStation}
        onChange={setJobStation}
        allowedStations={['counter', 'kitchen']}
      />

      <p className="text-body-sm text-on-surface-variant">
        Staff will create their own PIN when they first sign in on the store tablet.
      </p>

      <button
        type="submit"
        disabled={isSaving || !name.trim()}
        className="h-12 w-full rounded-full bg-primary-container text-label-lg font-semibold text-on-primary-container disabled:opacity-50"
      >
        {isSaving ? 'Adding…' : 'Add staff'}
      </button>
    </form>
  );
}
