type Field = { type?: string; title?: string; items?: { type?: string } };

export function AttributeFields({
  schema,
  value,
  onChange,
}: {
  schema: { properties?: Record<string, Field> } | null | undefined;
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}) {
  const properties = schema?.properties || {};
  const keys = Object.keys(properties);
  if (!keys.length) return null;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {keys.map((key) => {
        const field = properties[key];
        const title = field.title || key;
        const current = value[key];
        if (field.type === "boolean") {
          return (
            <label key={key} className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={Boolean(current)}
                onChange={(event) => onChange({ ...value, [key]: event.target.checked })}
              />
              {title}
            </label>
          );
        }
        if (field.type === "array") {
          return (
            <label key={key} className="block text-sm text-slate-700">
              {title}
              <input
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                value={Array.isArray(current) ? current.join(", ") : ""}
                placeholder="Separate with commas"
                onChange={(event) => onChange({
                  ...value,
                  [key]: event.target.value.split(",").map((item) => item.trim()).filter(Boolean),
                })}
              />
            </label>
          );
        }
        return (
          <label key={key} className="block text-sm text-slate-700">
            {title}
            <input
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
              type={field.type === "integer" || field.type === "number" ? "number" : "text"}
              value={current == null ? "" : String(current)}
              onChange={(event) => onChange({
                ...value,
                [key]: field.type === "integer" || field.type === "number"
                  ? (event.target.value === "" ? "" : Number(event.target.value))
                  : event.target.value,
              })}
            />
          </label>
        );
      })}
    </div>
  );
}
