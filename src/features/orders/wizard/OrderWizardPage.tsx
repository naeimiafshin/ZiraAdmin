import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconArrowRight,
  IconCheck,
  IconClock,
  IconDeviceFloppy,
  IconPackage,
  IconPlus,
  IconReceipt,
  IconTrash,
  IconUser,
} from '@tabler/icons-react';
import { userMessage } from '@/shared/api/errors';
import { usePerm } from '@/shared/auth/usePerm';
import { faNum } from '@/shared/lib/format';
import { groupMoney } from '@/shared/lib/money';
import { useBack } from '@/shared/lib/useBack';
import { Button } from '@/shared/ui/Button';
import { Badge, Card, Modal, UnitHead } from '@/shared/ui/kit';
import { useToast } from '@/shared/ui/toast';
import { useAllWarehouses } from '@/features/branches/transfers';
import { useCustomer } from '@/features/customers/api';
import { TierBadge } from '@/features/customers/components';
import { ItemPickerModal, type PickedItem } from '@/features/sales/ItemPicker';
import { CustomerSelect } from '@/features/sales/ui';
import {
  createOrder,
  previewOrder,
  useCustomerAddresses,
  useOrderDetail,
  useOrderMutations,
} from '../api/ordersApi';
import type {
  OrdersDeliveryType,
  OrdersLineIn,
  OrdersLineOut,
  OrdersOrderIn,
  OrdersPartMethod,
  OrdersPreviewOut,
  OrdersSettlementPartIn,
  OrdersSettlementPartOut,
  OrdersSettlementType,
  OrdersStatus,
} from '../api/types';
import {
  DELIVERY_TYPE,
  ORDER_STATUS,
  SETTLEMENT_TYPE,
} from '../ordersLabels';
import s from './wizard.module.css';

interface WizardLine {
  item_id: string;
  code: string;
  name: string;
  quantity: number;
  unit_name: string;
  packaging_ratio?: number; // مثلاً متراژ هر کارتن
  base_price?: number;
  discount_percent?: number;
}

interface WizardPart {
  id: string;
  method: OrdersPartMethod;
  amount: number;
  due_date: string;
  bank_name: string;
  cheque_serial: string;
  sayad_no: string;
  owner_name: string;
}

const STEPS = [
  { id: 1, title: 'مشتری و تحویل', desc: 'انتخاب مشتری، نشانی و انبار' },
  { id: 2, title: 'اقلام سفارش', desc: 'کالاها، متراژ و تعداد' },
  { id: 3, title: 'تسویه و پیش‌نمایش', desc: 'روش پرداخت و محاسبات مالی' },
  { id: 4, title: 'تأیید و ثبت نهایی', desc: 'بررسی نهایی و کد پیامکی' },
];

export default function OrderWizardPage() {
  const { id: editId } = useParams<{ id?: string }>();
  const isEdit = Boolean(editId);
  const navigate = useNavigate();
  const back = useBack('/orders/orders');
  const toast = useToast();
  const can = usePerm();

  // مرحله جاری ویزارد
  const [currentStep, setCurrentStep] = useState(1);

  // داده‌های سفارش در حالت ویرایش
  const { data: existingOrder, isLoading: loadingOrder } = useOrderDetail(editId);

  // گام ۱: اطلاعات مشتری و تحویل
  const [customer, setCustomer] = useState<{ id: string; code: string; name: string; mobile?: string } | null>(null);
  const [deliveryType, setDeliveryType] = useState<OrdersDeliveryType>('COMPANY_FLEET');
  const [warehouseId, setWarehouseId] = useState<string>('');
  const [addressId, setAddressId] = useState<string>('');
  const [customAddress, setCustomAddress] = useState({
    province: '',
    city: '',
    address: '',
    postalCode: '',
    recipientName: '',
    recipientPhone: '',
  });
  const [useManualAddress, setUseManualAddress] = useState(false);
  const [orderNote, setOrderNote] = useState('');

  // مشخصات مشتری از پروفایل مشتریان
  const { data: customerProfile } = useCustomer(customer?.id);

  // دریافت نشانی‌های مشتری
  const { data: customerAddresses } = useCustomerAddresses(customer?.id);

  // انبارهای فعال
  const { data: warehouses } = useAllWarehouses(can('organization.warehouses.list'));

  // گام ۲: اقلام سفارش
  const [lines, setLines] = useState<WizardLine[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);

  // گام ۳: تسویه و پیش‌نمایش مالی
  const [settlementType, setSettlementType] = useState<OrdersSettlementType>('CASH');
  const [couponCode, setCouponCode] = useState('');
  const [parts, setParts] = useState<WizardPart[]>([]);
  const [previewData, setPreviewData] = useState<OrdersPreviewOut | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // گام ۴: مودال و کد پیامکی
  const [otpModalOpen, setOtpModalOpen] = useState(false);
  const [createdOrderId, setCreatedOrderId] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState('');
  const [countdown, setCountdown] = useState(60);
  const [countdownActive, setCountdownActive] = useState(false);

  const mutations = useOrderMutations();

  // پر کردن فرم در صورت باز شدن در حالت ویرایش
  useEffect(() => {
    if (existingOrder && isEdit) {
      if (existingOrder.customer) {
        setCustomer({
          id: existingOrder.customer.id,
          code: existingOrder.customer.code ?? '',
          name: existingOrder.customer.store_name || existingOrder.customer.full_name || '',
          mobile: existingOrder.customer.mobile || undefined,
        });
      }
      setDeliveryType(existingOrder.delivery_type);
      if (existingOrder.warehouse?.id) {
        setWarehouseId(existingOrder.warehouse.id);
      }
      if (existingOrder.delivery_address) {
        setCustomAddress({
          province: existingOrder.delivery_province ?? '',
          city: existingOrder.delivery_city ?? '',
          address: existingOrder.delivery_address ?? '',
          postalCode: existingOrder.delivery_postal_code ?? '',
          recipientName: existingOrder.recipient_name ?? '',
          recipientPhone: existingOrder.recipient_phone ?? '',
        });
        setUseManualAddress(true);
      }
      setOrderNote(existingOrder.note ?? '');
      setSettlementType(existingOrder.settlement_type);

      // اقلام
      setLines(
        existingOrder.lines.map((l: OrdersLineOut) => ({
          item_id: l.item_id,
          code: l.item_code || '',
          name: l.item_name || '',
          quantity: Number(l.quantity),
          unit_name: l.unit_name || 'کارتن',
          packaging_ratio: 1.44,
          base_price: Number(l.unit_price) || 0,
          discount_percent: 0,
        }))
      );

      // پارت‌های تسویه
      setParts(
        existingOrder.settlement_parts.map((p: OrdersSettlementPartOut, idx: number) => ({
          id: `edit-part-${idx}`,
          method: p.method,
          amount: Number(p.amount),
          due_date: p.due_date ?? '',
          bank_name: p.bank_name ?? '',
          cheque_serial: p.cheque_serial ?? '',
          sayad_no: '',
          owner_name: '',
        }))
      );
    }
  }, [existingOrder, isEdit]);

  // پیش‌فرض انبار
  useEffect(() => {
    if (warehouses && warehouses.length > 0 && !warehouseId) {
      const first = warehouses[0];
      if (first) setWarehouseId(first.id);
    }
  }, [warehouses, warehouseId]);

  // پیش‌فرض نشانی مشتری
  useEffect(() => {
    if (customerAddresses && customerAddresses.length > 0 && !addressId && !useManualAddress) {
      const def = customerAddresses.find((a) => a.is_default) || customerAddresses[0];
      if (def) setAddressId(def.id);
    }
  }, [customerAddresses, addressId, useManualAddress]);

  // تایمر کد پیامکی
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (countdownActive && countdown > 0) {
      timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    } else if (countdown === 0) {
      setCountdownActive(false);
    }
    return () => clearTimeout(timer);
  }, [countdownActive, countdown]);

  // افزودن اقلام از ItemPicker
  const handleAddItems = (picked: PickedItem[]) => {
    const newLines = picked.map((p) => {
      const exist = lines.find((l) => l.item_id === p.item.id);
      if (exist) {
        return { ...exist, quantity: exist.quantity + p.quantity };
      }
      return {
        item_id: p.item.id,
        code: p.item.code,
        name: p.item.display_name,
        quantity: p.quantity,
        unit_name: p.unitName || 'کارتن',
        packaging_ratio: 1.44, // متراژ هر کارتن (پیش‌فرض سرامیک و کاشی)
        base_price: 0,
        discount_percent: 0,
      };
    });

    const merged = [...lines];
    for (const nl of newLines) {
      const idx = merged.findIndex((m) => m.item_id === nl.item_id);
      if (idx >= 0) {
        merged[idx] = nl;
      } else {
        merged.push(nl);
      }
    }
    setLines(merged);
    setPreviewData(null);
  };

  // حذف قلم کالا
  const handleRemoveLine = (itemId: string) => {
    setLines((ls) => ls.filter((l) => l.item_id !== itemId));
    setPreviewData(null);
  };

  // تغییر تعداد قلم
  const handleQuantityChange = (itemId: string, q: number) => {
    if (q < 1) return;
    setLines((ls) =>
      ls.map((l) => (l.item_id === itemId ? { ...l, quantity: q } : l))
    );
    setPreviewData(null);
  };

  // افزودن بخش تسویه جدید
  const handleAddPart = () => {
    const newPart: WizardPart = {
      id: `part-${Date.now()}`,
      method: settlementType === 'CHEQUE' ? 'CHEQUE' : 'CASH',
      amount: 0,
      due_date: '',
      bank_name: '',
      cheque_serial: '',
      sayad_no: '',
      owner_name: '',
    };
    setParts((ps) => [...ps, newPart]);
    setPreviewData(null);
  };

  const handleRemovePart = (partId: string) => {
    setParts((ps) => ps.filter((p) => p.id !== partId));
    setPreviewData(null);
  };

  const handleUpdatePart = (partId: string, updates: Partial<WizardPart>) => {
    setParts((ps) =>
      ps.map((p) => (p.id === partId ? { ...p, ...updates } : p))
    );
    setPreviewData(null);
  };

  // استعلام پیش‌نمایش مالی
  const handleCalculatePreview = async () => {
    if (!customer) {
      toast('لطفاً مشتری را انتخاب کنید.', 'error');
      return;
    }
    if (lines.length === 0) {
      toast('حداقل یک قلم کالا به سفارش اضافه کنید.', 'error');
      return;
    }

    try {
      setPreviewLoading(true);
      const payloadLines: OrdersLineIn[] = lines.map((l) => ({
        item_id: l.item_id,
        quantity: l.quantity,
      }));

      const payloadParts: OrdersSettlementPartIn[] = parts.map((p) => ({
        method: p.method,
        amount: p.amount,
        due_date: p.due_date || undefined,
        bank_name: p.bank_name || undefined,
        cheque_serial: p.cheque_serial || undefined,
        sayad_no: p.sayad_no || undefined,
        owner_name: p.owner_name || undefined,
      }));

      const res = await previewOrder({
        customer_id: customer.id,
        delivery_type: deliveryType,
        warehouse_id: warehouseId || undefined,
        settlement_type: settlementType,
        coupon_codes: couponCode ? [couponCode] : [],
        lines: payloadLines,
        settlement_parts: payloadParts,
      });

      setPreviewData(res);
      toast('محاسبات پیش‌نمایش مالی با موفقیت استعلام شد.', 'success');
    } catch (err) {
      toast(userMessage(err), 'error');
    } finally {
      setPreviewLoading(false);
    }
  };

  // ثبت نهایی سفارش
  const handleSubmitOrder = async () => {
    if (!customer) {
      toast('مشتری انتخاب نشده است.', 'error');
      setCurrentStep(1);
      return;
    }
    if (lines.length === 0) {
      toast('هیچ کالایی اضافه نشده است.', 'error');
      setCurrentStep(2);
      return;
    }

    const payload: OrdersOrderIn = {
      customer_id: customer.id,
      delivery_type: deliveryType,
      warehouse_id: warehouseId || undefined,
      address_id: !useManualAddress ? addressId || undefined : undefined,
      delivery_province: useManualAddress ? customAddress.province : undefined,
      delivery_city: useManualAddress ? customAddress.city : undefined,
      delivery_address: useManualAddress ? customAddress.address : undefined,
      delivery_postal_code: useManualAddress ? customAddress.postalCode : undefined,
      recipient_name: useManualAddress ? customAddress.recipientName : undefined,
      recipient_phone: useManualAddress ? customAddress.recipientPhone : undefined,
      settlement_type: settlementType,
      coupon_codes: couponCode ? [couponCode] : [],
      note: orderNote || undefined,
      lines: lines.map((l) => ({ item_id: l.item_id, quantity: l.quantity })),
      settlement_parts: parts.map((p) => ({
        method: p.method,
        amount: p.amount,
        due_date: p.due_date || undefined,
        bank_name: p.bank_name || undefined,
        cheque_serial: p.cheque_serial || undefined,
        sayad_no: p.sayad_no || undefined,
        owner_name: p.owner_name || undefined,
      })),
    };

    try {
      if (isEdit && editId) {
        await mutations.update.mutateAsync({
          id: editId,
          payload: {
            ...payload,
            lines: payload.lines,
            settlement_parts: payload.settlement_parts,
          },
        });
        toast('تغییرات سفارش با موفقیت ذخیره شد.', 'success');
        navigate(`/orders/orders?open=${editId}`);
      } else {
        const created = await createOrder(payload);
        setCreatedOrderId(created.id);
        toast('سفارش ثبت شد و کد تأیید ۴ رقمی پیامک گردید.', 'success');
        setOtpModalOpen(true);
        setCountdown(60);
        setCountdownActive(true);
      }
    } catch (err) {
      toast(userMessage(err), 'error');
    }
  };

  // تأیید کد ۴ رقمی پیامکی مشتری
  const handleVerifyOtp = async () => {
    if (!createdOrderId) return;
    if (otpCode.length !== 4) {
      toast('لطفاً کد ۴ رقمی را به صورت کامل وارد کنید.', 'error');
      return;
    }

    try {
      await mutations.confirmCode.mutateAsync({ id: createdOrderId, code: otpCode });
      toast('کد تأیید شد و وضعیت سفارش به «در انتظار تأیید حسابداری» منتقل شد.', 'success');
      setOtpModalOpen(false);
      navigate(`/orders/orders?open=${createdOrderId}`);
    } catch (err) {
      toast(userMessage(err), 'error');
    }
  };

  // ارسال مجدد کد پیامکی
  const handleResendOtp = async () => {
    if (!createdOrderId) return;
    try {
      await mutations.resendCode.mutateAsync(createdOrderId);
      toast('کد تأیید مجدداً ارسال گردید.', 'success');
      setCountdown(60);
      setCountdownActive(true);
    } catch (err) {
      toast(userMessage(err), 'error');
    }
  };

  // انصراف از وارد کردن کد و رفتن به فهرست
  const handleSkipOtp = () => {
    setOtpModalOpen(false);
    if (createdOrderId) {
      navigate(`/orders/orders?open=${createdOrderId}`);
    } else {
      navigate('/orders/orders');
    }
  };

  // اعتبارسنجی عبور از هر مرحله
  const canGoNext = useMemo(() => {
    if (currentStep === 1) {
      return Boolean(customer && (useManualAddress ? customAddress.address : addressId));
    }
    if (currentStep === 2) {
      return lines.length > 0;
    }
    if (currentStep === 3) {
      return Boolean(previewData);
    }
    return true;
  }, [currentStep, customer, addressId, useManualAddress, customAddress, lines, previewData]);

  const isBalanced = previewData ? Number(previewData.remaining_amount) <= 0 : false;

  if (loadingOrder && isEdit) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-500)' }}>
        در حال بارگذاری اطلاعات سفارش...
      </div>
    );
  }

  return (
    <div className={s.page}>
      {/* سربرگ صفحه و بازگشت */}
      <div className={s.head}>
        <div className={s.headStart}>
          <div className={s.mark}>
            <IconPackage size={26} />
          </div>
          <div>
            <div className={s.titleRow}>
              <h1 className={s.title}>
                {isEdit ? `ویرایش سفارش ${existingOrder?.order_number || ''}` : 'ثبت سفارش فروش جدید'}
              </h1>
              {isEdit && existingOrder ? (
                <Badge tone="info">{ORDER_STATUS[existingOrder.status as OrdersStatus]?.label}</Badge>
              ) : null}
            </div>
            <div className={s.sub}>
              مراحل ۴ گانه: مشتری و تحویل، اقلام و متراژ، تسویه و پیش‌نمایش، تأیید نهایی
            </div>
          </div>
        </div>

        <div>
          <Button variant="secondary" onClick={back} icon={<IconArrowRight size={16} />}>
            انصراف و بازگشت
          </Button>
        </div>
      </div>

      {/* استپر نوار مراحل ۴ گانه */}
      <div className={s.stepperBar} role="tablist">
        {STEPS.map((st) => {
          const isActive = currentStep === st.id;
          const isDone = currentStep > st.id;
          return (
            <div
              key={st.id}
              className={`${s.stepItem} ${isActive ? s.stepActive : ''} ${isDone ? s.stepCompleted : ''}`}
              onClick={() => {
                if (st.id < currentStep) setCurrentStep(st.id);
              }}
            >
              <div className={s.stepNum}>
                {isDone ? <IconCheck size={16} /> : faNum(st.id)}
              </div>
              <div className={s.stepLabel}>
                <span className={s.stepTitle}>{st.title}</span>
                <span className={s.stepDesc}>{st.desc}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── مرحله ۱: مشتری و تحویل ── */}
      {currentStep === 1 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <Card>
            <div className={s.secTitle}>
              <div className={s.secBar} />
              <h2 className={s.secText}>انتخاب مشتری و مشخصات تجاری</h2>
            </div>

            <div className={s.grid2}>
              <div className={s.field}>
                <label className={s.lbl}>
                  <span>مشتری</span>
                  <span className={s.req}>*</span>
                </label>
                <CustomerSelect
                  show="name"
                  label="انتخاب مشتری"
                  placeholder="جست‌وجو با نام، کد یا تلفن مشتری..."
                  value={customer}
                  onPick={(c) => {
                    setCustomer({
                      id: c.id,
                      code: c.code,
                      name: c.store_name || c.full_name,
                      mobile: c.mobile || undefined,
                    });
                    setPreviewData(null);
                  }}
                  allowed={can('customers.profiles.list')}
                />
              </div>

              <div className={s.field}>
                <label className={s.lbl}>
                  <span>کد تفصیلی مشتری</span>
                </label>
                <CustomerSelect
                  show="code"
                  label="کد تفصیلی"
                  placeholder="کد مشتری..."
                  value={customer}
                  onPick={(c) => {
                    setCustomer({
                      id: c.id,
                      code: c.code,
                      name: c.store_name || c.full_name,
                      mobile: c.mobile || undefined,
                    });
                    setPreviewData(null);
                  }}
                  allowed={can('customers.profiles.list')}
                />
              </div>
            </div>

            {/* کارت اطلاعات تکمیلی مشتری */}
            {customer ? (
              <div style={{ marginTop: 18 }} className={s.custCard}>
                <div className={s.custHeader}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <IconUser size={18} color="var(--brand)" />
                    <span className={s.custName}>{customer.name}</span>
                    <span style={{ fontSize: 12, color: 'var(--ink-400)' }}>
                      (کد: <span data-latin>{customer.code}</span>)
                    </span>
                  </div>
                  {customerProfile?.cooperation_level ? (
                    <TierBadge level={customerProfile.cooperation_level} />
                  ) : null}
                </div>

                <div className={s.custGrid}>
                  <div className={s.custKv}>
                    <span className={s.custK}>بیشینه روز چک (راس):</span>
                    <span className={s.custV}>
                      {customerProfile?.effective_payment_due_days
                        ? `${faNum(customerProfile.effective_payment_due_days)} روز`
                        : '—'}
                    </span>
                  </div>
                  <div className={s.custKv}>
                    <span className={s.custK}>تلفن همراه:</span>
                    <span className={s.custV} dir="ltr" data-latin>
                      {customer.mobile || customerProfile?.mobile_2 || '—'}
                    </span>
                  </div>
                  <div className={s.custKv}>
                    <span className={s.custK}>وضعیت خرید:</span>
                    <span className={s.custV}>
                      {customerProfile?.is_locked ? (
                        <span style={{ color: 'var(--brand)' }}>مسدود شده</span>
                      ) : (
                        <span style={{ color: 'var(--emerald)' }}>مجاز به ثبت سفارش</span>
                      )}
                    </span>
                  </div>
                </div>
              </div>
            ) : null}
          </Card>

          <Card>
            <div className={s.secTitle}>
              <div className={s.secBar} />
              <h2 className={s.secText}>مشخصات تحویل و بارگیری</h2>
            </div>

            <div className={s.grid2} style={{ marginBottom: 18 }}>
              <div className={s.field}>
                <label className={s.lbl}>
                  <span>نوع و روش تحویل</span>
                  <span className={s.req}>*</span>
                </label>
                <select
                  className={s.select}
                  value={deliveryType}
                  onChange={(e) => setDeliveryType(e.target.value as OrdersDeliveryType)}
                >
                  {Object.entries(DELIVERY_TYPE).map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              <div className={s.field}>
                <label className={s.lbl}>
                  <span>انبار بارگیری و ارسال</span>
                  <span className={s.req}>*</span>
                </label>
                <select
                  className={s.select}
                  value={warehouseId}
                  onChange={(e) => setWarehouseId(e.target.value)}
                >
                  <option value="">انتخاب انبار تحویل...</option>
                  {(warehouses ?? []).map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} ({w.code})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* نشانی تحویل */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span className={s.lbl}>نشانی محل تحویل بار</span>
                <button
                  type="button"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--brand)',
                    cursor: 'pointer',
                    fontSize: 12.5,
                    fontWeight: 600,
                  }}
                  onClick={() => setUseManualAddress((v) => !v)}
                >
                  {useManualAddress ? 'انتخاب از نشانی‌های ثبت‌شده مشتری' : '+ ورود نشانی جدید/دستی'}
                </button>
              </div>

              {!useManualAddress ? (
                <div className={s.addrList}>
                  {(customerAddresses ?? []).map((a) => {
                    const isSelected = addressId === a.id;
                    return (
                      <div
                        key={a.id}
                        className={`${s.addrCard} ${isSelected ? s.addrCardActive : ''}`}
                        onClick={() => setAddressId(a.id)}
                      >
                        <div className={s.addrTitle}>
                          <span>{a.title || 'نشانی مشتری'}</span>
                          {a.is_default ? <Badge tone="info">پیش‌فرض</Badge> : null}
                        </div>
                        <div className={s.addrText}>
                          {a.province}، {a.city}، {a.address}
                        </div>
                        {a.recipient_name ? (
                          <div style={{ fontSize: 11.5, color: 'var(--ink-400)' }}>
                            تحویل‌گیرنده: {a.recipient_name} ({a.recipient_phone || '—'})
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                  {(!customerAddresses || customerAddresses.length === 0) && (
                    <div
                      style={{
                        gridColumn: '1 / -1',
                        padding: 16,
                        textAlign: 'center',
                        color: 'var(--ink-400)',
                        fontSize: 12.5,
                      }}
                    >
                      هیچ نشانی ثبتی برای این مشتری یافت نشد. لطفاً گزینه «ورود نشانی جدید» را انتخاب کنید.
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div className={s.grid2}>
                    <div className={s.field}>
                      <label className={s.lbl}>استان</label>
                      <input
                        className={s.input}
                        value={customAddress.province}
                        onChange={(e) => setCustomAddress({ ...customAddress, province: e.target.value })}
                        placeholder="مثال: تهران"
                      />
                    </div>
                    <div className={s.field}>
                      <label className={s.lbl}>شهر</label>
                      <input
                        className={s.input}
                        value={customAddress.city}
                        onChange={(e) => setCustomAddress({ ...customAddress, city: e.target.value })}
                        placeholder="مثال: تهران"
                      />
                    </div>
                  </div>
                  <div className={s.field}>
                    <label className={s.lbl}>نشانی دقیق</label>
                    <input
                      className={s.input}
                      value={customAddress.address}
                      onChange={(e) => setCustomAddress({ ...customAddress, address: e.target.value })}
                      placeholder="خیابان، پلاک، واحد..."
                    />
                  </div>
                  <div className={s.grid2}>
                    <div className={s.field}>
                      <label className={s.lbl}>نام تحویل‌گیرنده</label>
                      <input
                        className={s.input}
                        value={customAddress.recipientName}
                        onChange={(e) => setCustomAddress({ ...customAddress, recipientName: e.target.value })}
                        placeholder="نام و نام خانوادگی..."
                      />
                    </div>
                    <div className={s.field}>
                      <label className={s.lbl}>همراه تحویل‌گیرنده</label>
                      <input
                        className={s.input}
                        dir="ltr"
                        data-latin
                        value={customAddress.recipientPhone}
                        onChange={(e) => setCustomAddress({ ...customAddress, recipientPhone: e.target.value })}
                        placeholder="0912..."
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* یادداشت سفارش */}
            <div className={s.field} style={{ marginTop: 18 }}>
              <label className={s.lbl}>توضیحات و یادداشت سفارش</label>
              <textarea
                className={s.textarea}
                rows={2}
                value={orderNote}
                onChange={(e) => setOrderNote(e.target.value)}
                placeholder="توضیحات داخلی یا درخواست مشتری درباره بسته‌بندی، زمان تحویل و..."
              />
            </div>
          </Card>
        </div>
      ) : null}

      {/* ── مرحله ۲: اقلام و متراژ سفارش ── */}
      {currentStep === 2 ? (
        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
            <div className={s.secTitle} style={{ marginBottom: 0 }}>
              <div className={s.secBar} />
              <h2 className={s.secText}>اقلام و متراژ سفارش</h2>
              <span style={{ fontSize: 12, color: 'var(--ink-400)' }}>
                ({faNum(lines.length)} قلم کالا)
              </span>
            </div>

            <Button
              variant="primary"
              size="sm"
              onClick={() => setPickerOpen(true)}
              icon={<IconPlus size={16} />}
            >
              افزودن کالا از کاتالوگ
            </Button>
          </div>

          {lines.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--ink-500)' }}>
              <IconPackage size={48} stroke={1.4} style={{ opacity: 0.5, marginBottom: 12 }} />
              <div style={{ fontSize: 14, fontWeight: 700 }}>هنوز هیچ کالایی انتخاب نشده است</div>
              <div style={{ fontSize: 12.5, color: 'var(--ink-400)', marginTop: 4 }}>
                روی دکمه «افزودن کالا از کاتالوگ» کلیک کنید تا کالاهای مورد نیاز را جست‌وجو و انتخاب نمایید.
              </div>
            </div>
          ) : (
            <div className={s.itemsTableWrap}>
              <table className={s.itemsTable}>
                <thead>
                  <tr>
                    <th>ردیف</th>
                    <th>کد کالا</th>
                    <th>نام و شرح کالا</th>
                    <th>واحد</th>
                    <th>تعداد بسته/کارتن</th>
                    <th>
                      <UnitHead unit="m²">متراژ هر بسته</UnitHead>
                    </th>
                    <th>
                      <UnitHead unit="m²">متراژ کل</UnitHead>
                    </th>
                    <th>عملیات</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, idx) => {
                    const totalArea = ((l.packaging_ratio ?? 1) * l.quantity).toFixed(2);
                    return (
                      <tr key={l.item_id}>
                        <td>{faNum(idx + 1)}</td>
                        <td dir="ltr" data-latin style={{ color: 'var(--ink-500)' }}>
                          {l.code}
                        </td>
                        <td style={{ textAlign: 'start', fontWeight: 600 }}>{l.name}</td>
                        <td>{l.unit_name}</td>
                        <td>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <input
                              type="number"
                              min={1}
                              value={l.quantity}
                              onChange={(e) => handleQuantityChange(l.item_id, Number(e.target.value))}
                              className={s.input}
                              style={{ width: 80, height: 34, textAlign: 'center' }}
                            />
                          </div>
                        </td>
                        <td>{faNum(l.packaging_ratio ?? 1)}</td>
                        <td style={{ fontWeight: 700, color: 'var(--brand)' }}>
                          {faNum(totalArea)}
                        </td>
                        <td>
                          <button
                            type="button"
                            className={s.delBtn}
                            onClick={() => handleRemoveLine(l.item_id)}
                            title="حذف قلم کالا"
                          >
                            <IconTrash size={16} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : null}

      {/* ── مرحله ۳: تسویه و پیش‌نمایش مالی ── */}
      {currentStep === 3 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <Card>
            <div className={s.secTitle}>
              <div className={s.secBar} />
              <h2 className={s.secText}>روش تسویه و بخش‌های پرداخت</h2>
            </div>

            <div className={s.grid2} style={{ marginBottom: 18 }}>
              <div className={s.field}>
                <label className={s.lbl}>
                  <span>روش کلی تسویه</span>
                  <span className={s.req}>*</span>
                </label>
                <select
                  className={s.select}
                  value={settlementType}
                  onChange={(e) => {
                    setSettlementType(e.target.value as OrdersSettlementType);
                    setPreviewData(null);
                  }}
                >
                  {Object.entries(SETTLEMENT_TYPE).map(([k, opt]) => (
                    <option key={k} value={k}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className={s.field}>
                <label className={s.lbl}>کد تخفیف (کوپن)</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    className={s.input}
                    value={couponCode}
                    onChange={(e) => {
                      setCouponCode(e.target.value);
                      setPreviewData(null);
                    }}
                    placeholder="کد کوپن تخفیف در صورت وجود..."
                  />
                </div>
              </div>
            </div>

            {/* جدول بخش‌های تسویه (چک، نقد، اعتباری) */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span className={s.lbl}>بخش‌های تسویه سفارش</span>
                <Button variant="secondary" size="sm" onClick={handleAddPart} icon={<IconPlus size={14} />}>
                  + افزودن بخش تسویه
                </Button>
              </div>

              {parts.length === 0 ? (
                <div style={{ padding: 20, textAlign: 'center', color: 'var(--ink-400)', fontSize: 13 }}>
                  هنوز بخشی تعریف نشده است. برای تخصیص مبالغ نقدی، چکی یا اعتباری دکمه «افزودن بخش تسویه» را بزنید.
                </div>
              ) : (
                <div className={s.itemsTableWrap}>
                  <table className={s.itemsTable}>
                    <thead>
                      <tr>
                        <th>روش</th>
                        <th>مبلغ (ریال)</th>
                        <th>تاریخ سررسید</th>
                        <th>بانک</th>
                        <th>سریال چک / شناسه صیادی</th>
                        <th>صاحب حساب</th>
                        <th>عملیات</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parts.map((p) => (
                        <tr key={p.id}>
                          <td>
                            <select
                              className={s.select}
                              style={{ height: 36, width: 110 }}
                              value={p.method}
                              onChange={(e) => handleUpdatePart(p.id, { method: e.target.value as OrdersPartMethod })}
                            >
                              <option value="CASH">نقد</option>
                              <option value="CHEQUE">چک</option>
                              <option value="CREDIT">اعتباری</option>
                            </select>
                          </td>
                          <td>
                            <input
                              className={s.input}
                              style={{ height: 36, width: 140, textAlign: 'center' }}
                              value={p.amount ? groupMoney(p.amount) : ''}
                              onChange={(e) => {
                                const raw = e.target.value.replace(/\D/g, '');
                                handleUpdatePart(p.id, { amount: Number(raw) || 0 });
                              }}
                              placeholder="مبلغ ریالی..."
                            />
                          </td>
                          <td>
                            {p.method === 'CHEQUE' ? (
                              <input
                                className={s.input}
                                style={{ height: 36, width: 120, textAlign: 'center' }}
                                value={p.due_date}
                                onChange={(e) => handleUpdatePart(p.id, { due_date: e.target.value })}
                                placeholder="۱۴۰۵/۰۲/۱۵"
                              />
                            ) : (
                              <span style={{ color: 'var(--ink-400)' }}>—</span>
                            )}
                          </td>
                          <td>
                            {p.method === 'CHEQUE' ? (
                              <input
                                className={s.input}
                                style={{ height: 36, width: 120 }}
                                value={p.bank_name}
                                onChange={(e) => handleUpdatePart(p.id, { bank_name: e.target.value })}
                                placeholder="بانک ملت..."
                              />
                            ) : (
                              <span style={{ color: 'var(--ink-400)' }}>—</span>
                            )}
                          </td>
                          <td>
                            {p.method === 'CHEQUE' ? (
                              <input
                                className={s.input}
                                style={{ height: 36, width: 130 }}
                                value={p.cheque_serial}
                                onChange={(e) => handleUpdatePart(p.id, { cheque_serial: e.target.value })}
                                placeholder="سریال / صیاد"
                              />
                            ) : (
                              <span style={{ color: 'var(--ink-400)' }}>—</span>
                            )}
                          </td>
                          <td>
                            {p.method === 'CHEQUE' ? (
                              <input
                                className={s.input}
                                style={{ height: 36, width: 120 }}
                                value={p.owner_name}
                                onChange={(e) => handleUpdatePart(p.id, { owner_name: e.target.value })}
                                placeholder="نام صاحب چک"
                              />
                            ) : (
                              <span style={{ color: 'var(--ink-400)' }}>—</span>
                            )}
                          </td>
                          <td>
                            <button
                              type="button"
                              className={s.delBtn}
                              onClick={() => handleRemovePart(p.id)}
                              title="حذف"
                            >
                              <IconTrash size={15} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </Card>

          {/* استعلام و ریز محاسبات مالی */}
          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div className={s.secTitle} style={{ marginBottom: 0 }}>
                <div className={s.secBar} />
                <h2 className={s.secText}>محاسبات مالی و پیش‌نمایش سیستم قیمت‌گذاری</h2>
              </div>

              <Button
                variant="primary"
                onClick={handleCalculatePreview}
                loading={previewLoading}
                icon={<IconReceipt size={16} />}
              >
                استعلام و به‌روزرسانی محاسبات
              </Button>
            </div>

            {previewData ? (
              <div className={s.previewSummary}>
                <div className={s.calcCard}>
                  <div className={s.calcRow}>
                    <span>جمع ناخالص کالاها:</span>
                    <span>{groupMoney(previewData.subtotal)} ریال</span>
                  </div>
                  <div className={s.calcRow}>
                    <span>مجموع تخفیف اقلام:</span>
                    <span style={{ color: 'var(--emerald)' }}>
                      {groupMoney(previewData.total_discount)}− ریال
                    </span>
                  </div>
                  <div className={s.calcRow}>
                    <span>تخفیف نقدی:</span>
                    <span style={{ color: 'var(--emerald)' }}>
                      {groupMoney(previewData.cash_discount_amount)}− ریال
                    </span>
                  </div>
                  <div className={s.calcRow}>
                    <span>مالیات بر ارزش افزوده (VAT):</span>
                    <span>{groupMoney(previewData.tax_amount)} ریال</span>
                  </div>
                  <div className={s.calcTotal}>
                    <span>مبلغ نهایی سفارش:</span>
                    <span>{groupMoney(previewData.total_amount)} ریال</span>
                  </div>
                  <div className={s.calcRow} style={{ marginTop: 8 }}>
                    <span>مبلغ پرداخت / ثبت‌شده:</span>
                    <span>{groupMoney(previewData.prepaid_amount)} ریال</span>
                  </div>
                  <div className={s.calcRow}>
                    <span>مانده تسویه:</span>
                    <span
                      style={{
                        fontWeight: 700,
                        color: isBalanced ? 'var(--emerald)' : 'var(--brand)',
                      }}
                    >
                      {groupMoney(previewData.remaining_amount)} ریال
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div className={`${s.balanceBox} ${isBalanced ? s.balanceOk : s.balanceErr}`}>
                    {isBalanced ? (
                      <>
                        <IconCheck size={20} />
                        <span>تراز تسویه برقرار است و مانده‌ای باقی نمانده است.</span>
                      </>
                    ) : (
                      <>
                        <IconAlertTriangle size={20} />
                        <div>
                          <div>تراز تسویه برقرار نیست!</div>
                          <div style={{ fontSize: 11.5, marginTop: 3 }}>
                            مانده پرداخت نشده: {groupMoney(previewData.remaining_amount)} ریال
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--ink-400)', fontSize: 13 }}>
                برای بررسی مبالغ، تخفیف‌ها و تراز تسویه، دکمه «استعلام و به‌روزرسانی محاسبات» را بزنید.
              </div>
            )}
          </Card>
        </div>
      ) : null}

      {/* ── مرحله ۴: تأیید و ثبت نهایی ── */}
      {currentStep === 4 ? (
        <Card>
          <div className={s.secTitle}>
            <div className={s.secBar} />
            <h2 className={s.secText}>بررسی نهایی مشخصات سفارش</h2>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            <div className={s.custCard}>
              <div className={s.custHeader}>
                <span className={s.custName}>خلاصه مشتری و تحویل</span>
              </div>
              <div className={s.custGrid} style={{ gridTemplateColumns: '1fr 1fr' }}>
                <div className={s.custKv}>
                  <span className={s.custK}>مشتری:</span>
                  <span className={s.custV}>{customer?.name}</span>
                </div>
                <div className={s.custKv}>
                  <span className={s.custK}>کد مشتری:</span>
                  <span className={s.custV} data-latin>
                    {customer?.code}
                  </span>
                </div>
                <div className={s.custKv}>
                  <span className={s.custK}>روش تحویل:</span>
                  <span className={s.custV}>{DELIVERY_TYPE[deliveryType]}</span>
                </div>
                <div className={s.custKv}>
                  <span className={s.custK}>تعداد اقلام:</span>
                  <span className={s.custV}>{faNum(lines.length)} قلم کالا</span>
                </div>
              </div>
            </div>

            <div className={s.custCard}>
              <div className={s.custHeader}>
                <span className={s.custName}>خلاصه مالی و تسویه</span>
              </div>
              <div className={s.custGrid} style={{ gridTemplateColumns: '1fr 1fr' }}>
                <div className={s.custKv}>
                  <span className={s.custK}>روش تسویه:</span>
                  <span className={s.custV}>{SETTLEMENT_TYPE[settlementType]?.label}</span>
                </div>
                <div className={s.custKv}>
                  <span className={s.custK}>مبلغ نهایی:</span>
                  <span className={s.custV} style={{ color: 'var(--brand)', fontWeight: 800 }}>
                    {previewData ? `${groupMoney(previewData.total_amount)} ریال` : '—'}
                  </span>
                </div>
                <div className={s.custKv}>
                  <span className={s.custK}>تعداد بخش‌های تسویه:</span>
                  <span className={s.custV}>{faNum(parts.length)} بخش</span>
                </div>
                <div className={s.custKv}>
                  <span className={s.custK}>تراز مالی:</span>
                  <span
                    className={s.custV}
                    style={{
                      color: isBalanced ? 'var(--emerald)' : 'var(--brand)',
                    }}
                  >
                    {isBalanced ? 'تراز کامل' : 'دارای مانده تسویه'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div
            style={{
              marginTop: 24,
              padding: 16,
              borderRadius: 14,
              background: 'var(--surface-2)',
              border: '1px solid var(--line)',
              fontSize: 13,
              lineHeight: 1.8,
              color: 'var(--ink-700)',
            }}
          >
            <b>راهنمای ثبت:</b>
            <p style={{ margin: '6px 0 0 0' }}>
              با کلیک روی «ثبت نهایی سفارش»، سفارش در وضعیت «در انتظار تأیید مشتری» ثبت شده و کد ۴ رقمی پیامکی به شماره همراه مشتری ارسال می‌گردد. پس از دریافت کد، می‌توانید آن را بلافاصله وارد و سفارش را به کارتابل حسابداری هدایت کنید.
            </p>
          </div>
        </Card>
      ) : null}

      {/* نوار چسبان پایین صفحه (ناوبری مراحل) */}
      <div className={s.stickyBottom}>
        <div>
          {currentStep > 1 ? (
            <Button
              variant="secondary"
              onClick={() => setCurrentStep((s) => s - 1)}
              icon={<IconArrowRight size={16} />}
            >
              مرحله قبل
            </Button>
          ) : null}
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {currentStep < 4 ? (
            <Button
              variant="primary"
              onClick={() => setCurrentStep((s) => s + 1)}
              disabled={!canGoNext}
              icon={<IconArrowLeft size={16} />}
            >
              مرحله بعد
            </Button>
          ) : (
            <Button
              variant="primary"
              onClick={handleSubmitOrder}
              loading={mutations.create.isPending || mutations.update.isPending}
              icon={<IconDeviceFloppy size={16} />}
            >
              {isEdit ? 'ذخیره تغییرات سفارش' : 'ثبت و ارسال کد پیامکی'}
            </Button>
          )}
        </div>
      </div>

      {/* انتخاب‌گر کالا (ItemPickerModal) */}
      <ItemPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onAdd={handleAddItems}
        docLabel="سفارش"
        warehouseId={warehouseId}
        warehouses={(warehouses ?? []).map((w) => ({ value: w.id, label: `${w.name} (${w.code})` }))}
        existing={lines.map((l) => l.item_id)}
      />

      {/* مودال ورود کد ۴ رقمی پیامکی مشتری */}
      <Modal
        open={otpModalOpen}
        onClose={handleSkipOtp}
        title="کد تأیید ۴ رقمی سفارش مشتری"
        footer={
          <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', width: '100%' }}>
            <Button variant="secondary" onClick={handleSkipOtp}>
              بعداً تأیید می‌شود
            </Button>
            <Button
              variant="primary"
              onClick={handleVerifyOtp}
              loading={mutations.confirmCode.isPending}
              disabled={otpCode.length !== 4}
            >
              تأیید و ارسال به حسابداری
            </Button>
          </div>
        }
      >
        <div className={s.otpModalWrap}>
          <div style={{ fontSize: 13, color: 'var(--ink-700)', lineHeight: 1.8 }}>
            کد تأیید به شماره همراه مشتری ({customer?.name}) پیامک شد.
            <br />
            لطفاً کد ۴ رقمی اعلام‌شده از طرف مشتری را وارد کنید:
          </div>

          <div className={s.otpInputs}>
            <input
              type="text"
              maxLength={4}
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
              className={s.otpDigit}
              style={{ width: 140, letterSpacing: 8 }}
              placeholder="••••"
              autoFocus
            />
          </div>

          <div style={{ fontSize: 12.5, color: 'var(--ink-500)', display: 'flex', alignItems: 'center', gap: 6 }}>
            {countdownActive ? (
              <>
                <IconClock size={15} />
                <span>زمان باقی‌مانده تا ارسال مجدد: {faNum(countdown)} ثانیه</span>
              </>
            ) : (
              <button
                type="button"
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--brand)',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: 12.5,
                }}
                onClick={handleResendOtp}
                disabled={mutations.resendCode.isPending}
              >
                ارسال مجدد پیامک کد تأیید
              </button>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}
