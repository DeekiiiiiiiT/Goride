// Stitch: dominion-redesign/parts_import_template_upload
export function ImportTemplateColumns({ count }: { count: number }) {
  return (
    <div className="rounded-xl bg-surface-container-lowest p-4 shadow-sm space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-on-surface">Columns in this template</h3>
        <span className="text-xs font-mono uppercase text-outline">{count} fields</span>
      </div>
      <div className="overflow-x-auto rounded-lg border border-outline-variant/30">
        <table className="w-full text-xs text-left">
          <thead className="bg-surface-container font-mono uppercase text-outline">
            <tr>
              <th className="p-2">Column Name</th>
              <th className="p-2">Requirement</th>
              <th className="p-2">Format & Rules</th>
            </tr>
          </thead>
          <tbody className="text-on-surface-variant">
            <tr className="border-t border-outline-variant/20">
              <td className="p-2">vehicle</td>
              <td className="p-2">Required</td>
              <td className="p-2">Make, model, chassis, year — or vehicle catalog id</td>
            </tr>
            <tr className="border-t border-outline-variant/20">
              <td className="p-2">part_type</td>
              <td className="p-2">Required</td>
              <td className="p-2">Must match this area&apos;s part types</td>
            </tr>
            <tr className="border-t border-outline-variant/20">
              <td className="p-2">brand, part_number</td>
              <td className="p-2">Required</td>
              <td className="p-2">Manufacturer and catalog number</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
