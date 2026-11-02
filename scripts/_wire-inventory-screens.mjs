import fs from 'fs';
import path from 'path';

const root = path.resolve(
  'apps/fleet/src/components/inventory/screens',
);

function patchIn11() {
  const f = path.join(root, 'In11Purchasing.tsx');
  let s = fs.readFileSync(f, 'utf8');
  if (!s.includes('InventoryPrimaryTabs')) {
    s = s.replace(
      "import { firstOpenPoNumber, firstVendorName, strField } from '../inventoryData';",
      "import { InventoryPrimaryTabs } from '../InventoryPrimaryTabs';\nimport { firstOpenPoNumber, firstVendorName, strField } from '../inventoryData';",
    );
  }
  if (!s.includes('featuredPoId')) {
    s = s.replace(
      '  const featuredPo = live.purchaseOrders[0];\n',
      "  const featuredPo = live.purchaseOrders[0];\n  const featuredPoId = featuredPo ? strField(featuredPo, 'id', '') : '';\n",
    );
  }
  s = s.replace(
    /      <div className="flex items-center gap-space-xs overflow-x-auto pb-1">[\s\S]*?      <\/div>\n      <\/div>\n      <\/div>/,
    '      <InventoryPrimaryTabs variant="pill" />\n      </div>\n      </div>',
  );
  s = s.replace(
    /data-stitch-data-stitch-id="sub-pill-orders" onClick=\{\(\) => form\.shell\.closeModal\(\)\}/,
    'data-stitch-data-stitch-id="sub-pill-orders" onClick={() => form.setTab(\'orders\')}',
  );
  s = s.replace(
    /data-stitch-data-stitch-id="sub-pill-suggested" onClick=\{\(\) => form\.shell\.closeModal\(\)\}/,
    'data-stitch-data-stitch-id="sub-pill-suggested" onClick={() => form.setTab(\'suggested\')}',
  );
  s = s.replace(
    /data-stitch-data-stitch-id="sub-pill-vendors" onClick=\{\(\) => form\.shell\.closeModal\(\)\}/,
    'data-stitch-data-stitch-id="sub-pill-vendors" onClick={() => form.setTab(\'vendors\')}',
  );
  s = s.replace(
    '<span className="px-1.5 py-0.2 bg-tertiary-fixed text-on-tertiary-fixed font-label-code text-[11px] font-bold rounded-full">1</span>',
    '<span className="px-1.5 py-0.2 bg-tertiary-fixed text-on-tertiary-fixed font-label-code text-[11px] font-bold rounded-full">{form.suggestedCount}</span>',
  );
  s = s.replace(
    '<span className="px-1.5 py-0.2 bg-surface-container-lowest text-on-surface-variant font-label-code text-[11px] rounded-full">3</span>',
    '<span className="px-1.5 py-0.2 bg-surface-container-lowest text-on-surface-variant font-label-code text-[11px] rounded-full">{form.vendorCount}</span>',
  );
  s = s.replace(
    /Export Audit Ledger[\s\S]*?onClick=\{\(\) => form\.shell\.closeModal\(\)\}/,
    (m) => m.replace('onClick={() => form.shell.closeModal()}', 'onClick={() => form.exportPurchasing()}'),
  );
  s = s.replace(
    /\+ 2 more archived orders[\s\S]*?onClick=\{\(\) => form\.shell\.closeModal\(\)\}/,
    (m) =>
      m.replace(
        '+ 2 more archived orders',
        `{form.showArchived ? 'Hide archived orders' : \`+ \${form.archivedCount} more archived orders\`}`,
      ).replace('onClick={() => form.shell.closeModal()}', 'onClick={() => form.setShowArchived((v) => !v)}'),
  );
  s = s.replace(
    'Cancel order\n                  </button>',
    'Cancel order\n                  </button>'.replace(
      /Cancel order[\s\S]*?<\/button>/,
      `<button type="button" className="h-9 px-space-md bg-surface-container hover:bg-surface-container-high text-on-surface font-body-sm text-body-sm rounded transition-all" onClick={() => featuredPoId && form.poAction(featuredPoId, 'cancel')}>\n                    Cancel order\n                  </button>`,
    ),
  );
  // PO actions - direct replace known block
  s = s.replace(
    `<button type="button" className="h-9 px-space-md bg-surface-container hover:bg-surface-container-high text-on-surface font-body-sm text-body-sm rounded transition-all" onClick={() => form.shell.closeModal()}>\n                    Cancel order`,
    `<button type="button" className="h-9 px-space-md bg-surface-container hover:bg-surface-container-high text-on-surface font-body-sm text-body-sm rounded transition-all" onClick={() => featuredPoId && form.poAction(featuredPoId, 'cancel')}>\n                    Cancel order`,
  );
  s = s.replace(
    `<button type="button" className="h-9 px-space-md bg-surface-container-highest hover:bg-surface-dim text-on-surface font-body-sm text-body-sm rounded font-medium transition-all flex items-center gap-1" onClick={() => form.shell.closeModal()}>`,
    `<button type="button" className="h-9 px-space-md bg-surface-container-highest hover:bg-surface-dim text-on-surface font-body-sm text-body-sm rounded font-medium transition-all flex items-center gap-1" onClick={() => featuredPoId && form.poAction(featuredPoId, 'submit')}>`,
  );
  s = s.replace(
    `<button type="button" className="h-9 px-space-lg bg-primary text-on-primary font-body-sm text-body-sm rounded font-semibold shadow-sm hover:bg-primary-container transition-all flex items-center gap-space-xs" onClick={() => form.shell.closeModal()}>\n      <span className="material-symbols-outlined text-[16px]">local_shipping</span>\n                    Mark ordered`,
    `<button type="button" className="h-9 px-space-lg bg-primary text-on-primary font-body-sm text-body-sm rounded font-semibold shadow-sm hover:bg-primary-container transition-all flex items-center gap-space-xs" onClick={() => featuredPoId && form.poAction(featuredPoId, 'order')}>\n      <span className="material-symbols-outlined text-[16px]">local_shipping</span>\n                    Mark ordered`,
  );
  s = s.replace(
    `<button type="button" className="px-space-md py-1 bg-surface-container-lowest text-primary rounded font-body-sm text-body-sm font-bold hover:bg-surface-container transition-all" onClick={() => form.shell.closeModal()}>`,
    `<button type="button" className="px-space-md py-1 bg-surface-container-lowest text-primary rounded font-body-sm text-body-sm font-bold hover:bg-surface-container transition-all" onClick={() => featuredPoId && form.poAction(featuredPoId, 'authorize')}>`,
  );
  s = s.replace(
    `Recompute Thresholds\n                </button>`,
    `Recompute Thresholds\n                </button>`.replace(
      /Recompute Thresholds[\s\S]*?onClick=\{\(\) => form\.shell\.closeModal\(\)\}/,
      'Recompute Thresholds</button>',
    ),
  );
  s = s.replace(
    `<button type="button" className="px-space-md py-1.5 bg-surface-container-low text-on-surface rounded font-body-sm text-body-sm hover:bg-surface-container transition-colors" onClick={() => form.shell.closeModal()}>\n                  Recompute Thresholds`,
    `<button type="button" className="px-space-md py-1.5 bg-surface-container-low text-on-surface rounded font-body-sm text-body-sm hover:bg-surface-container transition-colors" onClick={() => form.recomputeThresholds()}>\n                  Recompute Thresholds`,
  );
  let delIdx = 0;
  s = s.replace(/title="Delete Line" onClick=\{\(\) => form\.shell\.closeModal\(\)\}/g, () => {
    delIdx += 1;
    return `title="Delete Line" onClick={() => featuredPoId && form.removePoLine(featuredPoId, 'line-${delIdx}')}`;
  });
  fs.writeFileSync(f, s);
  console.log('In11 patched');
}

function patchIn12() {
  const f = path.join(root, 'In12Counts.tsx');
  let s = fs.readFileSync(f, 'utf8');
  if (!s.includes('InventoryPrimaryTabs')) {
    s = s.replace(
      "import { firstAssetSerial, strField } from '../inventoryData';",
      "import { InventoryPrimaryTabs } from '../InventoryPrimaryTabs';\nimport { firstAssetSerial, strField } from '../inventoryData';",
    );
  }
  s = s.replace(
    /      <div className="flex items-center gap-space-xs overflow-x-auto pt-space-xs">[\s\S]*?      <\/div>\n      <\/div>\n      <\/div>/,
    '      <InventoryPrimaryTabs variant="pill" />\n      </div>\n      </div>',
  );
  s = s.replace(
    'onClick={() => form.shell.closeModal()}>Open Sheet',
    "onClick={() => form.sessions[0] && form.openSheet(strField(form.sessions[0], 'id', ''))}>Open Sheet",
  );
  s = s.replace(
    'onClick={() => form.shell.closeModal()}>Audit Hash',
    "onClick={() => form.sessions[1] && form.copyAuditHash(strField(form.sessions[1], 'id', ''))}>Audit Hash",
  );
  s = s.replace(
    'onClick={() => form.shell.closeModal()}>View Record',
    "onClick={() => form.sessions[2] && form.viewRecord(strField(form.sessions[2], 'id', ''))}>View Record",
  );
  s = s.replace(
    `<span>Recount line</span>\n      </button>\n      <button type="button" className="px-space-md py-2.5 bg-surface-container hover:bg-surface-container-high text-on-error font-body-sm text-body-sm font-medium rounded-lg transition-colors flex items-center gap-1.5" onClick={() => form.shell.closeModal()}>`,
    `<span>Recount line</span>\n      </button>\n      <button type="button" className="px-space-md py-2.5 bg-surface-container hover:bg-surface-container-high text-on-error font-body-sm text-body-sm font-medium rounded-lg transition-colors flex items-center gap-1.5" onClick={() => form.pendingSessionId && form.reject(form.pendingSessionId)}>`,
  );
  s = s.replace(
    `<button type="button" className="px-space-md py-2.5 bg-surface-container-low hover:bg-surface-container text-on-surface font-body-sm text-body-sm font-medium rounded-lg transition-colors flex items-center gap-1.5" onClick={() => form.shell.closeModal()}>\n      <span className="material-symbols-outlined text-[18px]">replay</span>`,
    `<button type="button" className="px-space-md py-2.5 bg-surface-container-low hover:bg-surface-container text-on-surface font-body-sm text-body-sm font-medium rounded-lg transition-colors flex items-center gap-1.5" onClick={() => form.pendingSessionId && form.recount(form.pendingSessionId)}>\n      <span className="material-symbols-outlined text-[18px]">replay</span>`,
  );
  s = s.replace(
    'data-stitch-data-stitch-id="approveBtn" onClick={() => form.shell.closeModal()}',
    'data-stitch-data-stitch-id="approveBtn" onClick={() => form.pendingSessionId && form.approve(form.pendingSessionId)}',
  );
  s = s.replace(/value=\{form\.stitchInput\} onChange=\{\(e\) => form\.setStitchInput\(e\.target\.value\)\}/g, 'value={form.varianceReason} onChange={(e) => form.setVarianceReason(e.target.value)}');
  fs.writeFileSync(f, s);
  console.log('In12 patched');
}

patchIn11();
patchIn12();
