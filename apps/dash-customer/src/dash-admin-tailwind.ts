/**
 * Side-effect imports so Tailwind v4 includes classes from Dash admin UI
 * (alias imports alone are not scanned in the customer app build).
 */
import '../../dash-merchant/src/admin/DashAdminPortal';
import '../../dash-merchant/src/admin/pages/MerchantManager';
import '../../dash-merchant/src/admin/components/AdminLoginForm';
import '../../dash-merchant/src/admin/components/MerchantDetailModal';
import '../../dash-merchant/src/admin/components/MerchantActionDialog';
import '../../dash-merchant/src/admin/components/MerchantStatusBadge';
import '../../../packages/admin-core/src/components/AdminShell';
import '../../../packages/admin-core/src/components/AdminSidebar';
import '../../../packages/admin-core/src/components/AdminAuthGate';
