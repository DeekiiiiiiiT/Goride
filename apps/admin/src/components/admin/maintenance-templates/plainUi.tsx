/**
 * Plain Tailwind stand-ins for the old components/ui kit used by
 * MaintenanceTemplatesManager — same call shapes, no Radix.
 */
import React, { createContext, useContext, useEffect, useId, useRef, useState } from "react";

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "outline" | "ghost" | "destructive" | "secondary";
  size?: "default" | "sm" | "icon";
  asChild?: boolean;
};

const btnBase =
  "inline-flex items-center justify-center gap-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none";
const btnVariant: Record<NonNullable<BtnProps["variant"]>, string> = {
  default: "bg-blue-600 text-white hover:bg-blue-700 shadow-xs",
  outline: "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 shadow-xs",
  ghost: "text-slate-600 hover:bg-slate-100",
  destructive: "bg-red-600 text-white hover:bg-red-700",
  secondary: "border border-slate-200 bg-slate-100 text-slate-800 hover:bg-slate-200 shadow-xs",
};
const btnSize: Record<NonNullable<BtnProps["size"]>, string> = {
  default: "px-3 py-2",
  sm: "px-3 py-1.5",
  icon: "h-8 w-8 p-0",
};

export function Button({
  variant = "default",
  size = "default",
  className = "",
  asChild: _asChild,
  type = "button",
  ...props
}: BtnProps) {
  return (
    <button
      type={type}
      className={`${btnBase} ${btnVariant[variant]} ${btnSize[size]} ${className}`}
      {...props}
    />
  );
}

export function Input({ className = "", ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600 ${className}`}
      {...props}
    />
  );
}

export function Label({
  className = "",
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={`block text-xs font-medium text-slate-700 ${className}`} {...props} />;
}

export function Checkbox({
  checked,
  onCheckedChange,
  className = "",
  id,
  ...props
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "onChange"> & {
  checked?: boolean;
  onCheckedChange?: (v: boolean | "indeterminate") => void;
}) {
  return (
    <input
      id={id}
      type="checkbox"
      checked={!!checked}
      onChange={(e) => onCheckedChange?.(e.target.checked)}
      className={`h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600 ${className}`}
      {...props}
    />
  );
}

type DialogCtx = { open: boolean; onOpenChange: (o: boolean) => void };
const DialogContext = createContext<DialogCtx>({ open: false, onOpenChange: () => {} });

export function Dialog({
  open,
  onOpenChange,
  children,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <DialogContext.Provider value={{ open, onOpenChange }}>
      {open ? children : null}
    </DialogContext.Provider>
  );
}

export function DialogContent({
  className = "",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const { onOpenChange } = useContext(DialogContext);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onOpenChange]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-slate-900/40"
        onClick={() => onOpenChange(false)}
      />
      <div
        role="dialog"
        className={`relative z-10 w-full rounded-xl border border-slate-200 bg-white p-5 shadow-lg ${className}`}
      >
        {children}
      </div>
    </div>
  );
}

export function DialogHeader({
  className = "",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={`mb-3 space-y-1 ${className}`}>{children}</div>;
}

export function DialogTitle({
  className = "",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <h2 className={`text-base font-semibold text-slate-900 ${className}`}>{children}</h2>;
}

export function DialogFooter({
  className = "",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={`mt-4 flex justify-end gap-2 ${className}`}>{children}</div>;
}

type SelectCtx = {
  value?: string;
  onValueChange?: (v: string) => void;
  open: boolean;
  setOpen: (o: boolean) => void;
  label: string;
  setLabel: (l: string) => void;
  disabled?: boolean;
};
const SelectContext = createContext<SelectCtx | null>(null);

export function Select({
  value,
  onValueChange,
  disabled,
  children,
}: {
  value?: string;
  onValueChange?: (v: string) => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  return (
    <SelectContext.Provider
      value={{ value, onValueChange, open, setOpen, label, setLabel, disabled }}
    >
      <div className="relative">{children}</div>
    </SelectContext.Provider>
  );
}

export function SelectTrigger({
  className = "",
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  const ctx = useContext(SelectContext);
  if (!ctx) return null;
  return (
    <button
      type="button"
      disabled={ctx.disabled}
      onClick={() => ctx.setOpen(!ctx.open)}
      className={`flex h-9 w-full items-center justify-between rounded-lg border border-slate-200 bg-white px-3 text-left text-sm text-slate-800 disabled:opacity-50 ${className}`}
    >
      {children}
    </button>
  );
}

export function SelectValue({ placeholder }: { placeholder?: string }) {
  const ctx = useContext(SelectContext);
  return <span className="truncate">{ctx?.label || placeholder || ""}</span>;
}

export function SelectContent({
  className = "",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const ctx = useContext(SelectContext);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ctx?.open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) ctx.setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [ctx]);
  if (!ctx?.open) return null;
  return (
    <div
      ref={ref}
      className={`absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg ${className}`}
    >
      {children}
    </div>
  );
}

function childText(children: React.ReactNode): string {
  if (typeof children === "string" || typeof children === "number") return String(children);
  if (Array.isArray(children)) return children.map(childText).join("").trim();
  if (React.isValidElement(children)) {
    const props = children.props as { children?: React.ReactNode };
    return childText(props.children);
  }
  return "";
}

export function SelectItem({
  value,
  className = "",
  children,
}: {
  value: string;
  className?: string;
  children: React.ReactNode;
}) {
  const ctx = useContext(SelectContext);
  const selected = ctx?.value === value;
  const text = childText(children) || value;
  useEffect(() => {
    if (selected && ctx) ctx.setLabel(text);
  }, [selected, text, ctx]);
  return (
    <button
      type="button"
      className={`flex w-full items-center px-3 py-1.5 text-left text-sm hover:bg-slate-50 ${
        selected ? "bg-blue-50 text-blue-800" : "text-slate-800"
      } ${className}`}
      onClick={() => {
        ctx?.onValueChange?.(value);
        ctx?.setLabel(text);
        ctx?.setOpen(false);
      }}
    >
      {children}
    </button>
  );
}

export function Table({
  className = "",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <table className={`w-full text-left text-sm ${className}`}>{children}</table>;
}
export function TableHeader({ children }: { children: React.ReactNode }) {
  return <thead className="border-b border-slate-200 bg-slate-50/60 text-[11px] font-mono uppercase tracking-wider text-slate-400">{children}</thead>;
}
export function TableBody({ children }: { children: React.ReactNode }) {
  return <tbody className="divide-y divide-slate-100">{children}</tbody>;
}
export function TableRow({
  className = "",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <tr className={`hover:bg-slate-50/60 ${className}`}>{children}</tr>;
}
export function TableHead({
  className = "",
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  return <th className={`px-4 py-3 font-semibold ${className}`}>{children}</th>;
}
export function TableCell({
  className = "",
  children,
  colSpan,
}: {
  className?: string;
  children?: React.ReactNode;
  colSpan?: number;
}) {
  return (
    <td className={`px-4 py-3 ${className}`} colSpan={colSpan}>
      {children}
    </td>
  );
}

export function Tabs({
  value,
  onValueChange,
  className = "",
  children,
}: {
  value: string;
  onValueChange: (v: string) => void;
  className?: string;
  children: React.ReactNode;
}) {
  const inject = (nodes: React.ReactNode): React.ReactNode =>
    React.Children.map(nodes, (child) => {
      if (!React.isValidElement(child)) return child;
      const next = React.cloneElement(
        child as React.ReactElement<{
          tabsValue?: string;
          onTabsChange?: (v: string) => void;
          children?: React.ReactNode;
        }>,
        {
          tabsValue: value,
          onTabsChange: onValueChange,
        },
      );
      const kids = (child.props as { children?: React.ReactNode }).children;
      if (kids) {
        return React.cloneElement(next, { children: inject(kids) });
      }
      return next;
    });
  return (
    <div className={className} data-tabs-value={value}>
      {inject(children)}
    </div>
  );
}

export function TabsList({
  className = "",
  children,
  tabsValue,
  onTabsChange,
}: {
  className?: string;
  children: React.ReactNode;
  tabsValue?: string;
  onTabsChange?: (v: string) => void;
}) {
  return (
    <div className={`inline-flex gap-1 ${className}`}>
      {React.Children.map(children, (child) => {
        if (!React.isValidElement(child)) return child;
        return React.cloneElement(child as React.ReactElement<{ tabsValue?: string; onTabsChange?: (v: string) => void }>, {
          tabsValue,
          onTabsChange,
        });
      })}
    </div>
  );
}

export function TabsTrigger({
  value,
  className = "",
  children,
  tabsValue,
  onTabsChange,
}: {
  value: string;
  className?: string;
  children: React.ReactNode;
  tabsValue?: string;
  onTabsChange?: (v: string) => void;
}) {
  const active = tabsValue === value;
  return (
    <button
      type="button"
      data-state={active ? "active" : "inactive"}
      className={className}
      onClick={() => onTabsChange?.(value)}
    >
      {children}
    </button>
  );
}

export function TabsContent({
  value,
  className = "",
  children,
  tabsValue,
}: {
  value: string;
  className?: string;
  children: React.ReactNode;
  tabsValue?: string;
}) {
  if (tabsValue != null && tabsValue !== value) return null;
  return <div className={className}>{children}</div>;
}

export function DialogDescription({
  className = "",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <p className={`text-sm text-slate-500 ${className}`}>{children}</p>;
}

export function Textarea({
  className = "",
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={`w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600 ${className}`}
      {...props}
    />
  );
}

export function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

type MenuCtx = { open: boolean; setOpen: (o: boolean) => void };
const MenuContext = createContext<MenuCtx>({ open: false, setOpen: () => {} });

export function DropdownMenu({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <MenuContext.Provider value={{ open, setOpen }}>
      <div className="relative inline-block">{children}</div>
    </MenuContext.Provider>
  );
}

export function DropdownMenuTrigger({
  asChild: _asChild,
  children,
}: {
  asChild?: boolean;
  children: React.ReactNode;
}) {
  const { open, setOpen } = useContext(MenuContext);
  if (React.isValidElement(children)) {
    return React.cloneElement(children as React.ReactElement<{ onClick?: (e: React.MouseEvent) => void }>, {
      onClick: (e: React.MouseEvent) => {
        (children as React.ReactElement<{ onClick?: (e: React.MouseEvent) => void }>).props.onClick?.(e);
        setOpen(!open);
      },
    });
  }
  return (
    <button type="button" onClick={() => setOpen(!open)}>
      {children}
    </button>
  );
}

export function DropdownMenuContent({
  align: _align,
  className = "",
  children,
}: {
  align?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const { open, setOpen } = useContext(MenuContext);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, setOpen]);
  if (!open) return null;
  return (
    <div
      ref={ref}
      className={`absolute right-0 z-50 mt-1 min-w-[10rem] rounded-lg border border-slate-200 bg-white py-1 shadow-lg ${className}`}
    >
      {children}
    </div>
  );
}

export function DropdownMenuItem({
  className = "",
  children,
  onClick,
  disabled,
}: {
  className?: string;
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  const { setOpen } = useContext(MenuContext);
  return (
    <button
      type="button"
      disabled={disabled}
      className={`flex w-full items-center px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40 ${className}`}
      onClick={() => {
        onClick?.();
        setOpen(false);
      }}
    >
      {children}
    </button>
  );
}

export function DropdownMenuSeparator() {
  return <div className="my-1 h-px bg-slate-100" />;
}

// silence unused
void useId;
