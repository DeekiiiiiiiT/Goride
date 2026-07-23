/**
 * Super Admin — Vendors + Expense categories on one screen (tabs).
 * Lives in admin (not fleet re-export) so Tabs/React resolve to the host app.
 */
import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../ui/tabs';
import { VendorDatabaseManager } from './VendorDatabaseManager';
import { ExpenseCategoriesManager } from './ExpenseCategoriesManager';

export function AccountingCatalogManager({
  defaultTab = 'vendors',
}: {
  defaultTab?: 'vendors' | 'categories';
}) {
  const [tab, setTab] = React.useState(defaultTab);

  React.useEffect(() => {
    setTab(defaultTab);
  }, [defaultTab]);

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Vendors & categories
        </h2>
        <p className="mt-0.5 text-sm text-slate-500">
          Roam Jamaica catalog — companies and expense types fleets pick from across the apps.
        </p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as 'vendors' | 'categories')}>
        <TabsList className="h-11">
          <TabsTrigger value="vendors" className="min-h-9 px-4">
            Vendor Database
          </TabsTrigger>
          <TabsTrigger value="categories" className="min-h-9 px-4">
            Expense categories
          </TabsTrigger>
        </TabsList>
        <TabsContent value="vendors" className="mt-4">
          <VendorDatabaseManager embedded />
        </TabsContent>
        <TabsContent value="categories" className="mt-4">
          <ExpenseCategoriesManager embedded />
        </TabsContent>
      </Tabs>
    </div>
  );
}
