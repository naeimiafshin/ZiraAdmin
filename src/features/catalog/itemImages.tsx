import { useEffect, useState } from 'react';
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import { faNum } from '@/shared/lib/format';
import { Button } from '@/shared/ui/Button';
import { Modal } from '@/shared/ui/kit';
import s from './catalog.module.css';

/**
 * قانون نسبت تصویر آیتم (افشین 2026-11-04): عرض ۲ و ارتفاع ۳ (مثلاً ۸۰۰ × ۱۲۰۰ پیکسل)، با ۳٪ اختلاف مجاز.
 * تصویر ناجور فقط هشدار می‌گیرد (در بارگذاری و با «مرحله بعد» از گالری) و کاربر می‌تواند با همان تصویر ادامه دهد.
 */
export const ITEM_IMAGE_RATIO = 2 / 3;
export const ITEM_IMAGE_RATIO_TOLERANCE = 0.03;
export type ImgDim = { w: number; h: number };
export type GalleryImg = { key: string; url: string; kindLabel: string };

/** ابعاد واقعی تصویر (فایل تازه با object URL، تصویر ذخیره‌شده با آدرس media)؛ خطا ⇐ null (بی‌هشدار) */
export const measureImage = (url: string) => new Promise<ImgDim | null>((resolve) => {
  const im = new Image();
  im.onload = () => resolve(im.naturalWidth && im.naturalHeight ? { w: im.naturalWidth, h: im.naturalHeight } : null);
  im.onerror = () => resolve(null);
  im.src = url;
});
export const ratioOk = (d: ImgDim) => Math.abs(d.w / d.h - ITEM_IMAGE_RATIO) / ITEM_IMAGE_RATIO <= ITEM_IMAGE_RATIO_TOLERANCE;
const dimText = (d?: ImgDim | null) => (d ? `${faNum(d.w)} × ${faNum(d.h)} پیکسل` : '—');

/** ابعاد همه‌ی تصاویر گالری را یک بار اندازه می‌گیرد (کلید = شناسه‌ی تصویر) */
export function useImageDims(images: { key: string; url: string }[]) {
  const [dims, setDims] = useState<Record<string, ImgDim | null>>({});
  const sig = images.map((i) => i.key).join('|');
  useEffect(() => {
    let alive = true;
    images.filter((i) => !(i.key in dims)).forEach((i) => { measureImage(i.url).then((d) => { if (alive) setDims((x) => ({ ...x, [i.key]: d })); }); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);
  return dims;
}

/** مودال هشدار: تصاویر ناجور را داخل قاب ۲:۳ (بدون برش) با ابعادشان نشان می‌دهد */
export function RatioWarningModal({ images, dims, mode, onClose, onRemove, onContinue, onFix }: {
  images: GalleryImg[]; dims: Record<string, ImgDim | null>; mode: 'upload' | 'continue';
  onClose: () => void; onRemove?: () => void; onContinue?: () => void; onFix?: () => void;
}) {
  return (
    <Modal open onClose={onClose} title="نسبت تصویر مناسب نیست" width={640}
      footer={mode === 'upload'
        ? <><Button variant="secondary" onClick={onRemove}>حذف این {images.length > 1 ? 'تصاویر' : 'تصویر'}</Button><Button onClick={onClose}>نگه داشتن</Button></>
        : <><Button variant="secondary" onClick={onFix}>اصلاح تصاویر</Button><Button onClick={onContinue}>ادامه با همین تصاویر</Button></>}>
      <div data-ratio-warning={mode}>
        <p style={{ margin: '0 0 12px', lineHeight: 1.9 }}>
          تصویر آیتم باید نسبت <b>۲ به ۳</b> داشته باشد (عرض ۲ و ارتفاع ۳؛ مثلاً ۸۰۰ × ۱۲۰۰ پیکسل).
          {images.length > 1 ? ` این ${faNum(images.length)} تصویر` : ' این تصویر'} با این نسبت جور {images.length > 1 ? 'نیستند' : 'نیست'} و در کارت آیتم بریده یا با حاشیه نمایش داده {images.length > 1 ? 'می‌شوند' : 'می‌شود'}:
        </p>
        <div className={s.ratioGrid}>
          {images.map((i) => (
            <figure key={i.key} className={s.ratioFig}>
              <div className={s.ratioFrame}><img src={i.url} alt="" /></div>
              <figcaption><span className={s.sub}>{i.kindLabel}</span><b className="tnum">{dimText(dims[i.key])}</b></figcaption>
            </figure>
          ))}
        </div>
      </div>
    </Modal>
  );
}

/** پیش‌نمایش آیتم: قاب ۲:۳ که همه‌ی تصاویر را ورق می‌زند (کاور اول)؛ بدون تصویر ⇐ حرف اول نام روی رنگ خانواده */
export function ItemPreviewCarousel({ images, fallbackBg, fallbackText }: { images: string[]; fallbackBg: string; fallbackText: string }) {
  const [i, setI] = useState(0);
  const n = images.length; const cur = n ? Math.min(i, n - 1) : 0;
  if (!n) return <div className={s.previewFrame} style={{ background: fallbackBg }} data-preview-frame><span className={s.previewLetter}>{fallbackText}</span></div>;
  return (
    <div className={s.previewFrame} data-preview-frame data-count={n}>
      <img src={images[cur]} alt={`تصویر ${faNum(cur + 1)} آیتم`} />
      {n > 1 ? <>
        <button type="button" className={`${s.previewNav} ${s.previewPrev}`} aria-label="تصویر قبلی" onClick={() => setI((cur - 1 + n) % n)}><IconChevronRight size={18} /></button>
        <button type="button" className={`${s.previewNav} ${s.previewNext}`} aria-label="تصویر بعدی" onClick={() => setI((cur + 1) % n)}><IconChevronLeft size={18} /></button>
        <span className={s.previewCount} data-preview-count>{faNum(cur + 1)} از {faNum(n)}</span>
        <span className={s.previewDots}>{images.map((u, k) => <button key={u + k} type="button" aria-label={`تصویر ${faNum(k + 1)}`} aria-current={k === cur} className={k === cur ? s.previewDotOn : ''} onClick={() => setI(k)} />)}</span>
      </> : null}
    </div>
  );
}
