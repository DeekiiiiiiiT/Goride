import React, { useState } from "react";
import { Button } from "../ui/button";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { api } from "../../services/api";
import { toast } from "sonner";

type Decoded = {
  raw: string;
  chassisPrefix: string;
  confidence: string;
  matchCount?: number;
  matches?: Array<{ id?: string; make?: string; model?: string; chassis_code?: string | null; engine_code?: string | null }>;
};

export function FrameDecodeButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>Decode frames</Button>
      <FrameDecodeDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

export function FrameDecodeDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [text, setText] = useState("");
  const [rows, setRows] = useState<Decoded[]>([]);
  const [busy, setBusy] = useState(false);
  const [vehicleId, setVehicleId] = useState("");
  const [engineNumber, setEngineNumber] = useState("");
  const [engineFamily, setEngineFamily] = useState<string | null>(null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Decode frame numbers</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Label>Vehicle id to save onto</Label>
          <Textarea className="min-h-[40px] font-mono" placeholder="Paste the vehicle id, then confirm a single match" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} />
          <Label>Engine number, if you have it</Label>
          <Textarea className="min-h-[40px] font-mono" placeholder="1NZ-1234567" value={engineNumber} onChange={(e) => setEngineNumber(e.target.value)} />
          <Label>Paste up to 50 frame numbers</Label>
          <Textarea className="min-h-[120px] font-mono" placeholder={"ZRR80-0123456\nM900A-001234"} value={text} onChange={(e) => setText(e.target.value)} />
          <Button type="button" disabled={busy} onClick={async () => {
            setBusy(true);
            try {
              const res = await api.decodeFrameNumbers(text, engineNumber.trim() || undefined);
              setRows((res.items || []) as Decoded[]);
              setEngineFamily(res.engineFamily?.code ?? null);
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Decode failed");
            } finally {
              setBusy(false);
            }
          }}>{busy ? "Decoding…" : "Decode"}</Button>
          {engineFamily ? <p className="text-sm">Engine family: <span className="font-mono">{engineFamily}</span></p> : null}
          {rows.length > 0 ? (
            <ul className="max-h-64 overflow-auto text-sm space-y-2">
              {rows.map((row, i) => (
                <li key={`${row.raw}-${i}`} className="rounded border px-3 py-2">
                  <span className="font-mono">{row.raw}</span>
                  <span className="ml-2 text-slate-500">{row.chassisPrefix || "no chassis"} · {row.confidence}</span>
                  {row.matches?.length ? (
                    <p className="text-xs text-slate-500">{row.matches.map((m) => `${m.make} ${m.model} ${m.chassis_code ?? ""}`).join(" · ")}</p>
                  ) : <p className="text-xs text-slate-500">No catalog match yet.</p>}
                  {row.matches?.length === 1 && vehicleId.trim() ? (
                    <Button type="button" size="sm" variant="outline" className="mt-2" onClick={async () => {
                      const match = row.matches?.[0];
                      if (!match?.id) return;
                      try {
                        await api.confirmFrameDecode({
                          vehicleId: vehicleId.trim(),
                          catalogId: match.id,
                          chassisCode: match.chassis_code || row.chassisPrefix,
                          engineCode: match.engine_code || undefined,
                        });
                        toast.success("Saved onto the vehicle");
                      } catch (err) {
                        toast.error(err instanceof Error ? err.message : "Could not save");
                      }
                    }}>Save this match</Button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
