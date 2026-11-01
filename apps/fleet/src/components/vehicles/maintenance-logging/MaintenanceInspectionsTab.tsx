import React, { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { api } from "../../../services/api";

export function MaintenanceInspectionsTab() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Array<Record<string, unknown>>>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const templates = await api.listInspectionTemplates();
      setItems((templates.items || templates.templates || []) as Array<Record<string, unknown>>);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-stitch-secondary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="font-semibold">Inspections (DVIR)</h2>
      <p className="text-sm text-stitch-secondary">
        Templates configured: {items.length}. Driver shift inspections create findings and draft work order lines on fail.
      </p>
      <ul className="text-sm space-y-2">
        {items.map((t) => (
          <li key={String(t.id)} className="rounded-lg border px-3 py-2">
            {String(t.name ?? t.id)}
          </li>
        ))}
      </ul>
    </div>
  );
}
