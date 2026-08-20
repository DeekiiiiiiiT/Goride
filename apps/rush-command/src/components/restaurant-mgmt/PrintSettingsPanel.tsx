import { useState } from 'react';
import { toast } from 'sonner';
import { MaterialIcon } from '../../signup/components/MaterialIcon';
import type { PrintJobFixture } from '../../types/restaurant-mgmt';

interface PrintSettingsPanelProps {
  printerId: string | null;
  receiptFooter: string;
  printJobs: PrintJobFixture[];
  useApi: boolean;
  showInStoreOnCounter?: boolean;
  showInStoreOnKitchen?: boolean;
  onSaveSettings: (patch: {
    printerId?: string | null;
    receiptFooter?: string;
    showInStoreOnCounter?: boolean;
    showInStoreOnKitchen?: boolean;
  }) => Promise<void>;
  onTestPrint: () => Promise<void>;
  onRefreshJobs: () => void;
}

export default function PrintSettingsPanel({
  printerId,
  receiptFooter,
  printJobs,
  useApi,
  showInStoreOnCounter = false,
  showInStoreOnKitchen = false,
  onSaveSettings,
  onTestPrint,
  onRefreshJobs,
}: PrintSettingsPanelProps) {
  const [printer, setPrinter] = useState(printerId ?? '');
  const [footer, setFooter] = useState(receiptFooter);
  const [counterKds, setCounterKds] = useState(showInStoreOnCounter);
  const [kitchenKds, setKitchenKds] = useState(showInStoreOnKitchen);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSaveSettings({
        printerId: printer || null,
        receiptFooter: footer,
        showInStoreOnCounter: counterKds,
        showInStoreOnKitchen: kitchenKds,
      });
      toast.success('Print settings saved');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      await onTestPrint();
      onRefreshJobs();
      toast.success('Test print queued');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Test print failed');
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-inset-lg p-margin-mobile md:p-margin-tablet">
      <section className="space-y-inset-sm rounded-xl border border-outline-variant bg-surface-container-lowest p-inset-md">
        <h2 className="text-title-lg font-semibold">Printer</h2>
        <input
          value={printer}
          onChange={(e) => setPrinter(e.target.value)}
          placeholder="Printer ID or name"
          className="w-full rounded-lg border border-outline-variant px-3 py-2"
        />
        <textarea
          rows={3}
          value={footer}
          onChange={(e) => setFooter(e.target.value)}
          placeholder="Receipt footer message"
          className="w-full rounded-lg border border-outline-variant px-3 py-2"
        />
        <div className="flex flex-wrap gap-inset-sm">
          <button
            type="button"
            disabled={saving || !useApi}
            onClick={handleSave}
            className="rounded-lg bg-primary-container px-4 py-2 text-label-md font-semibold text-on-primary disabled:opacity-50"
          >
            Save
          </button>
          <button
            type="button"
            disabled={testing || !useApi}
            onClick={handleTest}
            className="flex items-center gap-1 rounded-lg border border-outline-variant px-4 py-2 text-label-md font-semibold disabled:opacity-50"
          >
            <MaterialIcon name="print" className="text-[18px]" />
            Test print
          </button>
        </div>
      </section>

      <section className="space-y-inset-sm rounded-xl border border-outline-variant bg-surface-container-lowest p-inset-md">
        <h2 className="text-title-lg font-semibold">Counter &amp; kitchen</h2>
        <p className="text-body-sm text-on-surface-variant">
          Show in-store orders on your existing counter and kitchen screens.
        </p>
        <label className="flex items-center gap-inset-sm">
          <input
            type="checkbox"
            checked={counterKds}
            onChange={(e) => setCounterKds(e.target.checked)}
            disabled={!useApi}
          />
          <span className="text-body-sm">Show in-store orders on counter</span>
        </label>
        <label className="flex items-center gap-inset-sm">
          <input
            type="checkbox"
            checked={kitchenKds}
            onChange={(e) => setKitchenKds(e.target.checked)}
            disabled={!useApi}
          />
          <span className="text-body-sm">Show in-store orders on kitchen queue</span>
        </label>
      </section>

      <section>
        <h3 className="mb-inset-sm text-title-md font-semibold">Recent print jobs</h3>
        <ul className="divide-y divide-outline-variant overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest">
          {printJobs.length === 0 ? (
            <li className="p-inset-md text-body-sm text-on-surface-variant">No print jobs yet</li>
          ) : (
            printJobs.map((job) => (
              <li key={job.id} className="flex items-center justify-between px-inset-md py-3 text-body-sm">
                <span>Order {job.orderId || 'test'}</span>
                <span className="rounded-full bg-surface-variant px-2 py-0.5 text-label-sm uppercase">
                  {job.status}
                </span>
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
}
