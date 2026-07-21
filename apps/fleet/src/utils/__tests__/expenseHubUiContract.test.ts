import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '../..');

describe('Expense Hub accessibility & UI contract', () => {
  it('shell uses min 44px touch targets on primary nav', () => {
    const shell = readFileSync(
      resolve(ROOT, 'components/business-finance/expense-hub/ExpenseHubShell.tsx'),
      'utf8',
    );
    expect(shell).toMatch(/min-h-11|min-h-\[44px\]|h-11|h-12/);
    expect(shell).toMatch(/Register/);
    expect(shell).toMatch(/Rules/);
  });

  it('hub components exist for full workflow', () => {
    const files = [
      'ExpenseHubShell.tsx',
      'ExpenseHubPage.tsx',
      'ExpenseHubOverview.tsx',
      'ExpenseHubRegister.tsx',
      'ExpenseHubNewExpenseWizard.tsx',
      'ExpenseHubRules.tsx',
      'ExpenseHubRuleBuilder.tsx',
      'ExpenseHubApprovals.tsx',
      'ExpenseHubDetail.tsx',
      'ExpenseHubVendors.tsx',
    ];
    for (const f of files) {
      expect(existsSync(resolve(ROOT, `components/business-finance/expense-hub/${f}`))).toBe(true);
    }
  });

  it('exposes Expense Hub as a dedicated Business Finance desk', () => {
    const sidebar = readFileSync(resolve(ROOT, 'components/layout/AppSidebar.tsx'), 'utf8');
    const app = readFileSync(resolve(ROOT, 'App.tsx'), 'utf8');
    expect(sidebar).toContain("{ id: 'expense-hub', label: 'Expense Hub' }");
    expect(app).toContain("currentPage === 'expense-hub'");
    expect(app).toContain('<ExpenseHubPage');
  });

  it('Stitch inventory documents all 18 screens', () => {
    const md = readFileSync(resolve(ROOT, 'docs/expense-hub-stitch-screens.md'), 'utf8');
    const required = [
      'Expense Hub — Overview (Mobile)',
      'Expense Hub — Overview (Desktop)',
      'Expense Hub — Expense Register (Mobile)',
      'Expense Hub — Expense Register (Desktop)',
      'Expense Hub — New Expense: Details (Mobile)',
      'Expense Hub — New Expense: Details (Desktop)',
      'Expense Hub — New Expense: Allocate & Review (Mobile)',
      'Expense Hub — New Expense: Allocate & Review (Desktop)',
      'Expense Hub — Recurring Rules (Mobile)',
      'Expense Hub — Recurring Rules (Desktop)',
      'Expense Hub — Rule Builder: Assign Vehicles (Mobile)',
      'Expense Hub — Rule Builder: Assign Vehicles (Desktop)',
      'Expense Hub — Approvals Queue (Mobile)',
      'Expense Hub — Approvals Queue (Desktop)',
      'Expense Hub — Expense Detail & Payment (Mobile)',
      'Expense Hub — Expense Detail & Payment (Desktop)',
      'Expense Hub — Categories & Vendors (Mobile)',
      'Expense Hub — Categories & Vendors (Desktop)',
    ];
    for (const title of required) {
      expect(md).toContain(title);
    }
  });
});
