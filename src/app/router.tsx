import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate } from 'react-router';
import { RedirectIfAuthenticated, RequireAuth } from '@/shared/auth/guards';
import { AdminLayout } from '@/shared/layout/AdminLayout';
import { FullPageLoader } from '@/shared/ui/FullPageLoader';
import { RouteError } from '@/features/system/RouteError';

const LoginPage = lazy(() => import('@/features/auth/LoginPage'));
const HomePage = lazy(() => import('@/features/home/HomePage'));
const PageNotBuilt = lazy(() => import('@/features/system/PageNotBuilt'));
// ── مدیریت کاربران ──
const UsersListPage = lazy(() => import('@/features/users/UsersListPage'));
const UserDetailPage = lazy(() => import('@/features/users/UserDetailPage'));
const UserFormPage = lazy(() => import('@/features/users/UserFormPage'));
const RolesPage = lazy(() => import('@/features/roles/RolesPage'));
const RoleDetailPage = lazy(() => import('@/features/roles/RoleDetailPage'));
const DepartmentsPage = lazy(() => import('@/features/departments/DepartmentsPage'));
const BranchAccessPage = lazy(() => import('@/features/branchAccess/BranchAccessPage'));
const SecurityPage = lazy(() => import('@/features/security/SecurityPage'));
const SessionLimitsPage = lazy(() => import('@/features/security/SecurityPage').then((m) => ({ default: m.SessionLimitsPage })));
const SecurityPolicyPage = lazy(() => import('@/features/security/SecurityPage').then((m) => ({ default: m.SecurityPolicyPage })));
const AccessLogPage = lazy(() => import('@/features/accessLog/AccessLogPage'));
const ActivityLogPage = lazy(() => import('@/features/events/ActivityLogPage'));
const EventTypesPage = lazy(() => import('@/features/events/EventTypesPage'));
const ChatPage = lazy(() => import('@/features/chat/ChatPage'));
const ProfilePage = lazy(() => import('@/features/account/ProfilePage'));
const NotificationsPage = lazy(() => import('@/features/notifications/NotificationsPage'));
// ── مدیریت مشتریان ──
const CustomersListPage = lazy(() => import('@/features/customers/CustomersListPage'));
const CustomerDetailPage = lazy(() => import('@/features/customers/CustomerDetailPage'));
const CustomerWizardPage = lazy(() => import('@/features/customers/registration/CustomerWizardPage'));
const RegistrationRequestsPage = lazy(() => import('@/features/customers/registration/RegistrationRequestsPage'));
const RegistrationReviewPage = lazy(() => import('@/features/customers/registration/RegistrationReviewPage'));
const GroupsPage = lazy(() => import('@/features/customers/groups/GroupsPage'));
const CreditHistoryPage = lazy(() => import('@/features/customers/credit/CreditHistoryPage'));

const BrandsPage = lazy(() => import('@/features/catalog/BrandsPage'));
const CategoriesPage = lazy(() => import('@/features/catalog/CategoriesPage'));
const AttributesPage = lazy(() => import('@/features/catalog/AttributesPage'));
const ProductsListPage = lazy(() => import('@/features/catalog/ProductsListPage'));
const ProductWizardPage = lazy(() => import('@/features/catalog/ProductWizardPage'));
const ItemsListPage = lazy(() => import('@/features/catalog/ItemsListPage'));
const ItemWizardPage = lazy(() => import('@/features/catalog/ItemWizardPage'));
const GoodDetailPage = lazy(() => import('@/features/catalog/GoodDetailPage'));
const ItemDetailPage = lazy(() => import('@/features/catalog/ItemDetailPage'));
const BundlesListPage = lazy(() => import('@/features/catalog/BundlesListPage'));
const BundleFormPage = lazy(() => import('@/features/catalog/BundleFormPage'));
// ── قیمت‌گذاری ──
const BranchesListPage = lazy(() => import('@/features/branches/BranchesListPage'));
const BranchDetailPage = lazy(() => import('@/features/branches/BranchDetailPage'));
const BranchFormPage = lazy(() => import('@/features/branches/BranchFormPage'));
const BranchStockPage = lazy(() => import('@/features/branches/BranchStockPage'));
const TransfersPage = lazy(() => import('@/features/branches/TransfersPage'));
const InterBranchTransfersPage = lazy(() => import('@/features/branches/InterBranchTransfersPage'));
const KardexPage = lazy(() => import('@/features/branches/KardexPage'));
const BranchReportsPage = lazy(() => import('@/features/branches/ReportsPage'));

const SupportTicketsPage = lazy(() => import('@/features/support/TicketsListPage'));
const SupportTicketDetailPage = lazy(() => import('@/features/support/TicketDetailPage'));
const SupportTicketNewPage = lazy(() => import('@/features/support/TicketNewPage'));
const SupportContactPage = lazy(() => import('@/features/support/ContactSubmissionsPage'));
const SupportCalendarPage = lazy(() => import('@/features/support/CalendarPage'));
const ApplyContractPage = lazy(() => import('@/features/pricing/ApplyContractPage'));
const PriceListsPage = lazy(() => import('@/features/pricing/PriceListsPage'));
const PriceListDetailPage = lazy(() => import('@/features/pricing/PriceListDetailPage'));
const ContractsPage = lazy(() => import('@/features/pricing/ContractsPage'));
const TaxRulesPage = lazy(() => import('@/features/pricing/TaxRulesPage'));
const TaxRuleFormPage = lazy(() => import('@/features/pricing/TaxRuleFormPage'));
const DiscountsPage = lazy(() => import('@/features/pricing/DiscountsPage'));
const CouponFormPage = lazy(() => import('@/features/pricing/CouponFormPage'));
const CampaignsPage = lazy(() => import('@/features/pricing/CampaignsPage'));
const CampaignFormPage = lazy(() => import('@/features/pricing/CampaignFormPage'));

// ── خرید و تأمین (html Fixed «Supply Management» + بک‌اند domains/supply) ──
const SuppliersListPage = lazy(() => import('@/features/supply/SuppliersListPage'));
const SupplierDetailPage = lazy(() => import('@/features/supply/SupplierDetailPage'));
const CouncilSettingsPage = lazy(() => import('@/features/supply/CouncilSettingsPage'));
const RequestsListPage = lazy(() => import('@/features/supply/RequestsListPage'));
const CouncilPage = lazy(() => import('@/features/supply/CouncilPage'));
const AdvicesListPage = lazy(() => import('@/features/supply/AdvicesListPage'));
const InvoicesListPage = lazy(() => import('@/features/supply/InvoicesListPage'));
const ReturnsListPage = lazy(() => import('@/features/supply/ReturnsListPage'));
const ConsignmentsListPage = lazy(() => import('@/features/supply/ConsignmentsListPage'));
const ReportsPage = lazy(() => import('@/features/supply/ReportsPage'));

// ── فروش (html Fixed «Sales Management» + بک‌اند domains/sales؛ افشین ۱۳ آبان ۱۴۰۵: ساخت صفحه‌ی کامل، جزئیات مودال) ──
const SalesInvoiceListPage = lazy(() => import('@/features/sales/invoices/InvoiceListPage'));
const SalesInvoiceFormPage = lazy(() => import('@/features/sales/invoices/InvoiceFormPage'));
const SalesInvoiceRedirect = lazy(() => import('@/features/sales/invoices/InvoiceRedirect'));

// ── مدیریت سفارشات (افشین ۱۵ آبان ۱۴۰۵) ──
const OrdersListPage = lazy(() => import('@/features/orders/OrdersListPage'));
const OrderWizardPage = lazy(() => import('@/features/orders/wizard/OrderWizardPage'));
const CustomerSupplyRequestsPage = lazy(() => import('@/features/orders/supply/CustomerSupplyRequestsPage'));

// ── تنظیمات (طرح html و IA ندارد؛ الگو: «مدیریت کاربران») ──
const CompanyPage = lazy(() => import('@/features/settings/CompanyPage'));
const UnitsPage = lazy(() => import('@/features/settings/UnitsPage'));
const NumberingPage = lazy(() => import('@/features/settings/NumberingPage'));
const EmailSettingsPage = lazy(() => import('@/features/settings/EmailSettingsPage'));
const CommercePolicyPage = lazy(() => import('@/features/settings/CommercePolicyPage'));
const ScoreFormulaPage = lazy(() => import('@/features/settings/ScoreFormulaPage'));
const CatalogDisplayPage = lazy(() => import('@/features/settings/CatalogDisplayPage'));
const NamingRulePage = lazy(() => import('@/features/settings/NamingRulePage'));
const CatalogConfigPage = lazy(() => import('@/features/settings/CatalogConfigPage'));
const GradePolicyPage = lazy(() => import('@/features/settings/GradePolicyPage'));
const BundlePoliciesPage = lazy(() => import('@/features/settings/BundlePoliciesPage'));
const CampaignNaturesPage = lazy(() => import('@/features/settings/CampaignNaturesPage'));

const page = (node: React.ReactNode) => <Suspense fallback={<FullPageLoader />}>{node}</Suspense>;
const inner = (node: React.ReactNode) => <Suspense fallback={null}>{node}</Suspense>;

export const router = createBrowserRouter([
  { element: <RedirectIfAuthenticated />, errorElement: <RouteError />, children: [{ path: '/login', element: page(<LoginPage />) }] },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AdminLayout />,
        children: [{ errorElement: <RouteError />, children: [
          { path: '/', element: inner(<HomePage />) },
          { path: '/dashboard', element: <Navigate to="/" replace /> },
          // ── مدیریت کاربران (route = route منوی بک‌اند) ──
          { path: '/identity/users', element: inner(<UsersListPage />) },
          { path: '/identity/users/new', element: inner(<UserFormPage />) },
          { path: '/identity/users/:id', element: inner(<UserDetailPage />) },
          { path: '/identity/users/:id/edit', element: inner(<UserFormPage />) },
          { path: '/rbac/roles', element: inner(<RolesPage />) },
          { path: '/rbac/roles/:id', element: inner(<RoleDetailPage />) },
          { path: '/identity/departments', element: inner(<DepartmentsPage />) },
          { path: '/identity/branch-access', element: inner(<BranchAccessPage />) },
          { path: '/identity/notifications', element: inner(<NotificationsPage />) },
          { path: '/identity/security', element: inner(<SecurityPage />) },
          { path: '/chat', element: inner(<ChatPage />) },
          // پروفایل من (2026-10-27): برای همه‌ی کارکنان، بی‌مجوز خاص
          { path: '/account/profile', element: inner(<ProfilePage />) },
          { path: '/rbac/access-log', element: inner(<AccessLogPage />) },
          // «محدودیت نشست» و «سیاست‌های امنیتی» در تنظیمات (2026-10-25)؛ مسیرهای منوی رخدادها به همان‌جا می‌روند
          // رخدادها (2026-10-25): لاگ فعالیت‌ها و کاتالوگ رخدادها (هر صفحه فقط در یک ماژول)
          { path: '/events/activity-log', element: inner(<ActivityLogPage />) },
          { path: '/identity/activity-log', element: <Navigate to="/events/activity-log" replace /> },
          { path: '/events/event-types', element: inner(<EventTypesPage />) },
          { path: '/events/sessions/limits', element: <Navigate to="/settings/session-limits" replace /> },
          { path: '/events/sessions/timeouts', element: <Navigate to="/settings/session-limits" replace /> },
          { path: '/events/sessions/*', element: <Navigate to="/identity/security" replace /> },
          // هر صفحه فقط یک جا (افشین 2026-10-25): مسیرهای قدیمی events به خانه‌ی اصلی صفحه هدایت می‌شوند
          { path: '/events/security-policy', element: <Navigate to="/settings/security-policy" replace /> },
          { path: '/settings/session-limits', element: inner(<SessionLimitsPage />) },
          { path: '/settings/security-policy', element: inner(<SecurityPolicyPage />) },
          // ── مدیریت مشتریان (route = route منوی بک‌اند: customers.profiles / registration_requests / groups) ──
          { path: '/customers/profiles', element: inner(<CustomersListPage />) },
          { path: '/customers/profiles/new', element: inner(<CustomerWizardPage />) },
          { path: '/customers/profiles/:id', element: inner(<CustomerDetailPage />) },
          { path: '/customers/registration-requests', element: inner(<RegistrationRequestsPage />) },
          { path: '/customers/registration-requests/:id', element: inner(<RegistrationReviewPage />) },
          { path: '/customers/groups', element: inner(<GroupsPage />) },
          { path: '/customers/credit-history', element: inner(<CreditHistoryPage />) },

          { path: '/catalog/brands', element: inner(<BrandsPage />) },
          { path: '/catalog/categories', element: inner(<CategoriesPage />) },
          { path: '/catalog/attributes', element: inner(<AttributesPage />) },
          { path: '/catalog/products', element: inner(<ProductsListPage />) },
          { path: '/catalog/products/new', element: inner(<ProductWizardPage />) },
          // جزئیات کالای تکی زیر «کالاها» (افشین 2026-10-23)
          { path: '/catalog/products/goods/:id', element: inner(<GoodDetailPage />) },
          { path: '/catalog/items', element: inner(<ItemsListPage />) },
          { path: '/catalog/items/new', element: inner(<ItemWizardPage />) },
          { path: '/catalog/items/:id', element: inner(<ItemDetailPage />) },
          { path: '/catalog/items/:id/edit', element: inner(<ItemWizardPage key="edit" />) },
          { path: '/catalog/bundles', element: inner(<BundlesListPage />) },
          { path: '/catalog/bundles/new', element: inner(<BundleFormPage />) },
          { path: '/catalog/bundles/:id/edit', element: inner(<BundleFormPage key="edit" />) },
          // ── قیمت‌گذاری (route = route منوی بک‌اند) ──
          // «قیمت کالاها» حذف شد (افشین 2026-10-24) ⇐ اعمال قرارداد از «لیست‌های قیمت»
          { path: '/pricing/prices', element: <Navigate to="/pricing/price-lists" replace /> },
          { path: '/pricing/price-lists/apply', element: inner(<ApplyContractPage />) },
          { path: '/pricing/price-lists', element: inner(<PriceListsPage />) },
          { path: '/pricing/price-lists/:id', element: inner(<PriceListDetailPage />) },
          { path: '/pricing/contracts', element: inner(<ContractsPage />) },
          { path: '/pricing/tax-rules', element: inner(<TaxRulesPage />) },
          { path: '/pricing/tax-rules/new', element: inner(<TaxRuleFormPage />) },
          { path: '/pricing/tax-rules/:id/edit', element: inner(<TaxRuleFormPage key="edit" />) },
          // ── بازاریابی: تخفیف‌ساز (تب‌ها: ترکیبی / خرید نقدی / کدها)، کمپین‌ها ──
          { path: '/pricing/discounts', element: inner(<DiscountsPage />) },
          { path: '/pricing/coupons', element: inner(<DiscountsPage initialTab="codes" />) },
          { path: '/pricing/discounts/coupons/new', element: inner(<CouponFormPage />) },
          { path: '/pricing/discounts/coupons/:id/edit', element: inner(<CouponFormPage key="edit" />) },
          { path: '/pricing/campaigns', element: inner(<CampaignsPage />) },
          { path: '/pricing/campaigns/new', element: inner(<CampaignFormPage />) },
          { path: '/pricing/campaigns/:id/edit', element: inner(<CampaignFormPage key="edit" />) },
          // ── مدیریت شعب (route = route منوی بک‌اند organization.branches) ──
          { path: '/organization/branches', element: inner(<BranchesListPage />) },
          { path: '/organization/branches/new', element: inner(<BranchFormPage />) },
          { path: '/organization/branches/stock', element: inner(<BranchStockPage />) },
          { path: '/organization/branches/transfers', element: inner(<TransfersPage />) },
          { path: '/organization/branches/inter-transfers', element: inner(<InterBranchTransfersPage />) },
          { path: '/organization/branches/kardex', element: inner(<KardexPage />) },
          { path: '/organization/branches/reports', element: inner(<BranchReportsPage />) },
          { path: '/organization/branches/:id', element: inner(<BranchDetailPage />) },
          { path: '/organization/branches/:id/edit', element: inner(<BranchFormPage key="edit" />) },
          // ── پشتیبانی و ارتباطات (منوی IA: در انتظار، پاسخ داده شده، ثبت تیکت + منابع بک‌اند: فرم تماس، تقویم) ──
          { path: '/support/tickets', element: inner(<SupportTicketsPage key="waiting" mode="waiting" />) },
          { path: '/support/answered', element: inner(<SupportTicketsPage key="answered" mode="answered" />) },
          { path: '/support/outbound', element: inner(<SupportTicketsPage key="outbound" mode="outbound" />) },
          { path: '/support/outbound/new', element: inner(<SupportTicketNewPage />) },
          { path: '/support/tickets/:id', element: inner(<SupportTicketDetailPage />) },
          { path: '/support/contact-submissions', element: inner(<SupportContactPage />) },
          { path: '/support/calendar', element: inner(<SupportCalendarPage />) },
          // ── خرید و تأمین (route = route منوی بک‌اند) ──
          { path: '/supply/supply-requests', element: inner(<RequestsListPage />) },
          { path: '/supply/supply-requests/new', element: inner(<RequestsListPage creating />) },
          { path: '/supply/supply-council', element: inner(<CouncilPage />) },
          { path: '/supply/receipt-advices', element: inner(<AdvicesListPage />) },
          { path: '/supply/receipt-advices/new', element: inner(<AdvicesListPage creating />) },
          { path: '/supply/purchase-invoices', element: inner(<InvoicesListPage />) },
          { path: '/supply/purchase-invoices/new', element: inner(<InvoicesListPage creating />) },
          { path: '/supply/purchase-returns', element: inner(<ReturnsListPage />) },
          { path: '/supply/purchase-returns/new', element: inner(<ReturnsListPage creating />) },
          { path: '/supply/consignments', element: inner(<ConsignmentsListPage />) },
          { path: '/supply/consignments/new', element: inner(<ConsignmentsListPage creating />) },
          { path: '/supply/reports', element: inner(<ReportsPage />) },
          { path: '/supply/suppliers', element: inner(<SuppliersListPage />) },
          { path: '/supply/suppliers/:id', element: inner(<SupplierDetailPage />) },
          // ── تنظیمات (route = route منوی بک‌اند) ──
          { path: '/organization/company', element: inner(<CompanyPage />) },
          { path: '/settings/units', element: inner(<UnitsPage />) },
          { path: '/settings/numbering', element: inner(<NumberingPage />) },
          { path: '/settings/email', element: inner(<EmailSettingsPage />) },
          { path: '/settings/commerce-policy', element: inner(<CommercePolicyPage />) },
          { path: '/settings/score-formula', element: inner(<ScoreFormulaPage />) },
          { path: '/settings/catalog-display', element: inner(<CatalogDisplayPage />) },
          { path: '/settings/naming-rule', element: inner(<NamingRulePage />) },
          { path: '/settings/catalog-config', element: inner(<CatalogConfigPage />) },
          { path: '/settings/grade-policy', element: inner(<GradePolicyPage />) },
          { path: '/settings/bundle-policies', element: inner(<BundlePoliciesPage />) },
          { path: '/settings/campaign-natures', element: inner(<CampaignNaturesPage />) },
          { path: '/settings/supply-council', element: inner(<CouncilSettingsPage />) },
          // ── فروش (route = route منوی بک‌اند) ──
          { path: '/sales/invoices', element: inner(<SalesInvoiceListPage />) },
          { path: '/sales/invoices/new', element: inner(<SalesInvoiceFormPage />) },
          { path: '/sales/invoices/:id', element: inner(<SalesInvoiceRedirect />) },
          { path: '/sales/invoices/:id/edit', element: inner(<SalesInvoiceFormPage />) },
          // ── مدیریت سفارشات (route = route منوی بک‌اند) ──
          { path: '/orders/orders', element: inner(<OrdersListPage />) },
          { path: '/orders/orders/new', element: inner(<OrderWizardPage />) },
          { path: '/orders/orders/:id', element: inner(<OrdersListPage />) },
          { path: '/orders/orders/:id/edit', element: inner(<OrderWizardPage />) },
          { path: '/orders/invoices', element: inner(<OrdersListPage defaultTab="invoices" />) },
          { path: '/orders/supply-requests', element: inner(<CustomerSupplyRequestsPage />) },
          // صفحه‌های هر دامنه این‌جا اضافه می‌شوند؛ بقیه‌ی مسیرهای منو ⇐ «هنوز ساخته نشده»
          { path: '*', element: inner(<PageNotBuilt />) },
        ] }],
      },
    ],
  },
]);
