/**
 * پنل ادمین زیرا مارکت — نوع‌های کامپوننت‌های مشترک (src/shared/ui، ZiraAdmin@75486b4). مستندات است، نه کد اجرایی.
 * در بسته: window.Zira.<Name>. در مخزن: import { Name } from '@/shared/ui/<file>'.
 */
import type { ReactNode, ButtonHTMLAttributes, InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes, ForwardRefExoticComponent, RefAttributes } from 'react';

export type Tone = 'success' | 'neutral' | 'warning' | 'danger' | 'info' | 'brand';

// ── Actions ── src/shared/ui/Button.tsx
export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; size?: 'sm' | 'md' | 'lg';
  loading?: boolean; loadingText?: ReactNode; block?: boolean; icon?: ReactNode;
};
export function Button(p: ButtonProps): JSX.Element;

// ── kit.tsx ──
export type CardProps = { children: ReactNode; className?: string; pad?: boolean };
export function Card(p: CardProps): JSX.Element;
export type SectionTitleProps = { children: ReactNode; extra?: ReactNode };
export function SectionTitle(p: SectionTitleProps): JSX.Element;
export type PageHeadProps = { title?: ReactNode; sub?: ReactNode; back?: () => void; actions?: ReactNode };
export function PageHead(p: PageHeadProps): JSX.Element;
export type BadgeProps = { tone?: Tone; children: ReactNode };
export function Badge(p: BadgeProps): JSX.Element;
export type ChipProps = { children: ReactNode; tip?: boolean };
export function Chip(p: ChipProps): JSX.Element;
export type AvatarProps = { seed: string; name: string; size?: number };
export function Avatar(p: AvatarProps): JSX.Element;
export type SegmentedProps<T extends string> = { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode; disabled?: boolean; tip?: string }[] };
export function Segmented<T extends string>(p: SegmentedProps<T>): JSX.Element;
export type UnderlineTabsProps<T extends string> = { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[] };
export function UnderlineTabs<T extends string>(p: UnderlineTabsProps<T>): JSX.Element;
export type InfoBannerProps = { children: ReactNode; tone?: 'info' | 'warning' };
export function InfoBanner(p: InfoBannerProps): JSX.Element;
export type EmptyProps = { title: string; text?: ReactNode; icon?: ReactNode; action?: ReactNode };
export function Empty(p: EmptyProps): JSX.Element;
/** پیام با userMessage(error): فارسی بک‌اند همان‌طور، وگرنه پیام عمومی وضعیت. */
export type ErrorBoxProps = { error: unknown; onRetry?: () => void };
export function ErrorBox(p: ErrorBoxProps): JSX.Element;
export type SkeletonRowsProps = { rows?: number; height?: number };
export function SkeletonRows(p: SkeletonRowsProps): JSX.Element;
/** فقط وقتی total > 0 رندر شود. sizes پیش‌فرض [10, 50, 100]. */
export type PaginationProps = { page: number; pageSize: number; total: number; onPage: (p: number) => void; onPageSize?: (n: number) => void; sizes?: number[] };
export function Pagination(p: PaginationProps): JSX.Element;
/** portal؛ Esc و کلیک بیرون onClose. width پیش‌فرض 520. */
export type ModalProps = { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; width?: number };
export function Modal(p: ModalProps): JSX.Element | null;
/** مقدار تهی ⇐ «—». */
export type KeyValueProps = { label: string; children: ReactNode; ltr?: boolean };
export function KeyValue(p: KeyValueProps): JSX.Element;
export function Rial(): JSX.Element;
export type UnitHeadProps = { children: ReactNode; unit?: string };
export function UnitHead(p: UnitHeadProps): JSX.Element;
export type DiscountedPriceProps = { original: number | null | undefined; discount: number | null | undefined; final: number | null | undefined; rial?: boolean; fmt: (n: number) => string };
export function DiscountedPrice(p: DiscountedPriceProps): JSX.Element;

// ── form.tsx ──
type FieldBase = { label: string; required?: boolean; error?: string; hint?: ReactNode; span?: number };
export type FieldProps = FieldBase & { children: ReactNode; htmlFor?: string };
export function Field(p: FieldProps): JSX.Element;
/** ارقام تایپ‌شده فارسی می‌شوند مگر latin یا type=password. format هنگام تایپ (موبایل، کارت، شبا، مبلغ). */
export type InputProps = InputHTMLAttributes<HTMLInputElement> & FieldBase & { latin?: boolean; format?: (v: string) => string };
export const Input: ForwardRefExoticComponent<InputProps & RefAttributes<HTMLInputElement>>;
export type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'> & FieldBase & { placeholder?: string; options: { value: string; label: string }[] };
export const Select: ForwardRefExoticComponent<SelectProps & RefAttributes<HTMLSelectElement>>;
export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & FieldBase;
export const Textarea: ForwardRefExoticComponent<TextareaProps & RefAttributes<HTMLTextAreaElement>>;
export type ToggleProps = { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; disabled?: boolean };
export function Toggle(p: ToggleProps): JSX.Element;
/** به‌جای دکمه‌ی «انتخاب» کنار فیلد؛ onOpen مودال جدول انتخابی را باز می‌کند. */
export type PickerFieldProps = FieldBase & { value: string; placeholder?: string; onOpen: () => void; onClear?: () => void; disabled?: boolean; icon?: ReactNode };
export function PickerField(p: PickerFieldProps): JSX.Element;
export type FormGridProps = { cols?: number; children: ReactNode };
export function FormGrid(p: FormGridProps): JSX.Element;

// ── دیگر فرم‌ها ──
export type DropdownProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'> & { options: { value: string; label: string }[]; placeholder?: string; invalid?: boolean; buttonClassName?: string };
export const Dropdown: ForwardRefExoticComponent<DropdownProps & RefAttributes<HTMLSelectElement>>;
export type ComboboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & { value: string; onChange: (v: string) => void; options: string[]; invalid?: boolean };
export const Combobox: ForwardRefExoticComponent<ComboboxProps & RefAttributes<HTMLInputElement>>;
/** مقدار متنی شمسی «۱۴۰۵/۰۸/۰۸»؛ همان props Input. */
export type JalaliDateInputProps = InputProps & { minYear?: number; maxYear?: number };
export const JalaliDateInput: ForwardRefExoticComponent<JalaliDateInputProps & RefAttributes<HTMLInputElement>>;
export type StepperProps = { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; unit?: string; label?: string; disabled?: boolean };
export function Stepper(p: StepperProps): JSX.Element;
/** فقط صفحه‌های احراز هویت. */
export type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; hint?: ReactNode; icon?: ReactNode; trailing?: ReactNode };
export const TextField: ForwardRefExoticComponent<TextFieldProps & RefAttributes<HTMLInputElement>>;

// ── جدول‌ها ──
export type Column<T> = { key: string; header: ReactNode; render: (row: T, index: number) => ReactNode; align?: 'center'; code?: boolean };
/** rows === undefined ⇐ اسکلت؛ [] ⇐ empty. */
export type DataTableProps<T> = {
  columns: Column<T>[]; rows: T[] | undefined; rowKey: (r: T) => string; onRowClick?: (r: T) => void; isSelected?: (r: T) => boolean;
  loading?: boolean; error?: unknown; onRetry?: () => void; empty?: ReactNode; minWidth?: number; variant?: 'cards' | 'flat'; expanded?: (r: T) => ReactNode;
};
export function DataTable<T>(p: DataTableProps<T>): JSX.Element;
export type FilterDef = { key: string; label: string; value: string; options: { value: string; label: string; soon?: boolean }[]; onChange: (v: string) => void; soon?: boolean; range?: { unit?: string } };
export type TableFiltersProps = { search?: string; onSearch?: (v: string) => void; placeholder?: string; filters?: FilterDef[]; count?: ReactNode; extra?: ReactNode; stacked?: boolean; onReset?: () => void; extraActive?: boolean; noSearch?: boolean };
export function TableFilters(p: TableFiltersProps): JSX.Element;
/** متن قابل مقایسه برای جست‌وجوی سمت فرانت: ارقام لاتین، ی/ک فارسی، بدون نیم‌فاصله، حروف کوچک. */
export function searchKey(...parts: (string | null | undefined)[]): string;
export type ColumnOption = { key: string; label: string; fixed?: boolean; soon?: boolean };
export type ColumnPickerProps = { options: ColumnOption[]; isVisible: (k: string) => boolean; toggle: (k: string) => void; reset: () => void; visibleCount: number };
export function ColumnPicker(p: ColumnPickerProps): JSX.Element;

// ── بازخورد و پوشش ──
export type AlertProps = { tone?: 'danger' | 'info'; children: ReactNode; footer?: ReactNode };
export function Alert(p: AlertProps): JSX.Element;
export type SpinnerProps = { size?: number; label?: string };
export function Spinner(p: SpinnerProps): JSX.Element;
export function ToastProvider(p: { children: ReactNode }): JSX.Element;
/** toast(متن) یا toast(userMessage(e), 'error'). */
export function useToast(): (text: string, kind?: 'success' | 'error') => void;
/** یک بار در App؛ متن = data-tip ⇐ aria-label ⇐ متن دکمه. */
export function TooltipLayer(): JSX.Element;
/** src/features/branches/SoonTag.tsx */
export function SoonTag(p: { tip?: string }): JSX.Element;
export function BrandMark(p: { size?: number; tile?: boolean }): JSX.Element;
export function BrandLockup(p: { height?: number }): JSX.Element;

// ── ابزارها (shared/lib) ──
/** MutationObserver سراسری: هر رقم لاتین/عربی در متن DOM فارسی می‌شود؛ استثنا data-latin، script، style، textarea. */
export function startPersianDigits(root?: HTMLElement): void;
export function faNum(n: number | string | null | undefined): string;
export function faDate(iso?: string | null): string;
export function faDateTime(iso?: string | null): string;
export function formatCard(v: string): string;
export function formatIban(v: string): string;
/** «۱٬۲۵۰٬۰۰۰» برای value ورودی مبلغ. */
export function groupMoney(raw: string | number | null | undefined): string;
/** فقط رقم لاتین برای state و بدنه‌ی ارسالی. */
export function moneyDigits(text: string | number | null | undefined): string;
export function formatMobileInput(v: string): string;
/** پیام دقیق خطای موبایل یا null. */
export function mobileProblem(v: string): string | null;
