import { Navigate, useParams } from 'react-router';

/** پیوند مستقیم `/sales/invoices/:id` ⇐ فهرست فاکتورها با برگه‌ی همان فاکتور در مودال (جزئیات مثل html در مودال است) */
export default function InvoiceRedirect() {
  const { id } = useParams();
  return <Navigate to={id ? `/sales/invoices?open=${id}` : '/sales/invoices'} replace />;
}
