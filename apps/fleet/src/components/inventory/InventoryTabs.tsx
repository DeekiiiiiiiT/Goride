import { In1Overview } from './screens/In1Overview';
import { In2Stock } from './screens/In2Stock';
import { StockRowMenu } from './StockRowMenu';
import { In6VehicleKits } from './screens/In6VehicleKits';
import { In8Assets } from './screens/In8Assets';
import { In10Movements } from './screens/In10Movements';
import { In11Purchasing } from './screens/In11Purchasing';
import { In12Counts } from './screens/In12Counts';
import { In13Alerts } from './screens/In13Alerts';

export type InventoryTabId =
  | 'overview'
  | 'stock'
  | 'vehicle-kits'
  | 'assets'
  | 'movements'
  | 'purchasing'
  | 'counts'
  | 'alerts';

/** R3-09: Stitch tab bars live inside each screen — no duplicate shadcn tab list. */
export function InventoryTabs({
  tab,
}: {
  tab: InventoryTabId;
  onTabChange: (next: InventoryTabId) => void;
}) {
  switch (tab) {
    case 'overview':
      return <In1Overview />;
    case 'stock':
      return (
        <>
          <In2Stock />
          <StockRowMenu />
        </>
      );
    case 'vehicle-kits':
      return <In6VehicleKits />;
    case 'assets':
      return <In8Assets />;
    case 'movements':
      return <In10Movements />;
    case 'purchasing':
      return <In11Purchasing />;
    case 'counts':
      return <In12Counts />;
    case 'alerts':
      return <In13Alerts />;
    default:
      return <In1Overview />;
  }
}
