import React, { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import type { ExpenseVendor } from "../../../types/expenseHub";
import { useExpenseHubVendors, useRequestExpenseVendor } from "../../../hooks/useExpenseHub";
import { Button } from "../../ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "../../ui/command";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../../ui/dialog";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "../../ui/popover";
import { cn } from "../../ui/utils";

function vendorLabel(v: ExpenseVendor): string {
  const sub = v.notes?.trim();
  return sub ? `${v.name} · ${sub}` : v.name;
}

export function MaintenanceWorkOrderVendorPicker({
  value,
  onChange,
  disabled,
  className,
}: {
  value?: string | null;
  onChange: (vendorId: string | null) => void | Promise<void>;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const vendorsQuery = useExpenseHubVendors();
  const requestVendor = useRequestExpenseVendor();

  const vendors = vendorsQuery.data?.items ?? [];
  const selected = useMemo(
    () => vendors.find((v) => v.id === value) ?? null,
    [vendors, value],
  );

  const submitNew = async () => {
    const name = newName.trim();
    if (!name) return;
    try {
      const res = await requestVendor.mutateAsync({ name });
      await onChange(res.data.id);
      toast.success(res.alreadyExists ? "Vendor already in catalog" : "Vendor requested — pending Roam approval");
      setAddOpen(false);
      setNewName("");
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add vendor");
    }
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled || vendorsQuery.isLoading}
            className={cn(
              "h-7 w-full justify-between px-2 font-normal text-[11px]",
              className,
            )}
          >
            {vendorsQuery.isLoading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : selected ? (
              <span className="truncate text-left">{vendorLabel(selected)}</span>
            ) : (
              <span className="truncate text-stitch-secondary">Select vendor…</span>
            )}
            <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
          <Command>
            <CommandInput placeholder="Search vendors…" className="h-8 text-xs" />
            <CommandList>
              <CommandEmpty>No vendor found.</CommandEmpty>
              <CommandGroup>
                <CommandItem
                  value="__clear__"
                  onSelect={() => {
                    void onChange(null);
                    setOpen(false);
                  }}
                  className="text-xs"
                >
                  No vendor
                </CommandItem>
                {vendors.map((v) => (
                  <CommandItem
                    key={v.id}
                    value={`${v.name} ${v.notes ?? ""}`}
                    onSelect={() => {
                      void onChange(v.id);
                      setOpen(false);
                    }}
                    className="text-xs"
                  >
                    <span className="truncate flex-1">{vendorLabel(v)}</span>
                    {v.status === "pending" ? (
                      <span className="text-[10px] text-amber-700">pending</span>
                    ) : null}
                    <Check
                      className={cn(
                        "ml-1 h-3 w-3",
                        value === v.id ? "opacity-100" : "opacity-0",
                      )}
                    />
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
          <div className="border-t p-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 w-full justify-start gap-1 text-xs"
              onClick={() => {
                setOpen(false);
                setAddOpen(true);
              }}
            >
              <Plus className="h-3 w-3" />
              Add vendor
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add vendor</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="wo-vendor-name">Business name</Label>
            <Input
              id="wo-vendor-name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Kingston Auto Works"
            />
            <p className="text-xs text-stitch-secondary">
              New vendors are submitted to the Roam catalog (same as Expense Hub).
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!newName.trim() || requestVendor.isPending}
              onClick={() => void submitNew()}
            >
              {requestVendor.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
