import React, { useEffect, useState } from "react";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { partsEnterpriseApi } from "../../../services/partSourcingService";
import { toast } from "sonner";

type SpecKey = { key: string; label: string };
type Item = {
  id: string;
  spec_key: string;
  spec_value: string;
  manufacturer: string;
  part_number: string;
  name: string;
  evidence_url?: string;
};

export function UniversalItemsPanel({ token }: { token: string }) {
  const [keys, setKeys] = useState<SpecKey[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [specKey, setSpecKey] = useState("");
  const [specValue, setSpecValue] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [partNumber, setPartNumber] = useState("");
  const [name, setName] = useState("");
  const [connector, setConnector] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");

  function load() {
    void partsEnterpriseApi.specKeys(token).then((data) => {
      const rows = Array.isArray(data.items) ? data.items as SpecKey[] : [];
      setKeys(rows);
      setSpecKey((current) => current || rows[0]?.key || "");
    }).catch(() => setKeys([]));
    void partsEnterpriseApi.universalParts(token).then((data) => {
      setItems(Array.isArray(data.items) ? data.items as Item[] : []);
    }).catch(() => setItems([]));
  }

  useEffect(() => { load(); }, [token]);

  return (
    <div className="space-y-3">
      <h2 className="text-base font-semibold">Universal items</h2>
      <p className="text-sm text-slate-500">A brand product that fits a size or spec, such as a 525 mm wiper blade. Every item needs a source.</p>
      <div className="grid gap-2 sm:grid-cols-2 border rounded-lg p-3">
        <div>
          <Label>Spec</Label>
          <select className="h-9 w-full rounded-md border bg-transparent px-2 text-sm" value={specKey} onChange={(e) => setSpecKey(e.target.value)}>
            {keys.map((key) => <option key={key.key} value={key.key}>{key.label}</option>)}
          </select>
        </div>
        <div>
          <Label>Value</Label>
          <Input value={specValue} onChange={(e) => setSpecValue(e.target.value)} />
        </div>
        <div>
          <Label>Brand</Label>
          <Input value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} />
        </div>
        <div>
          <Label>Part number</Label>
          <Input value={partNumber} onChange={(e) => setPartNumber(e.target.value)} />
        </div>
        <div>
          <Label>Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <Label>Connector (wipers)</Label>
          <Input value={connector} onChange={(e) => setConnector(e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <Label>Source link</Label>
          <Input value={evidenceUrl} onChange={(e) => setEvidenceUrl(e.target.value)} />
        </div>
        <Button type="button" size="sm" disabled={!specKey || !specValue.trim() || !manufacturer.trim() || !partNumber.trim() || !evidenceUrl.trim()} onClick={() => {
          void partsEnterpriseApi.saveUniversalPart(token, {
            specKey,
            specValue: specValue.trim(),
            manufacturer: manufacturer.trim(),
            partNumber: partNumber.trim(),
            name: name.trim() || partNumber.trim(),
            evidenceUrl: evidenceUrl.trim(),
            extra: connector.trim() ? { connector: connector.trim() } : {},
          }).then(() => {
            setSpecValue("");
            setManufacturer("");
            setPartNumber("");
            setName("");
            setConnector("");
            setEvidenceUrl("");
            load();
          }).catch((err) => toast.error(err instanceof Error ? err.message : "Could not save"));
        }}>Save item</Button>
      </div>
      <ul className="text-sm space-y-1">
        {items.length === 0 ? <li className="text-slate-500">No universal items yet.</li> : items.map((item) => (
          <li key={item.id}>{item.manufacturer} {item.part_number} · {item.name} · {item.spec_key} {item.spec_value}</li>
        ))}
      </ul>
    </div>
  );
}
