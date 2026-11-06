import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { IconCurrentLocation, IconTrash } from '@tabler/icons-react';
import { Button } from '@/shared/ui/Button';
import { toFaDigits } from '@/shared/lib/text';
import { parseCoord } from './coords';
import s from './branches.module.css';

/**
 * انتخاب موقعیت شعبه روی نقشه (Leaflet + کاشی OpenStreetMap؛ افشین 2026-10-24).
 * کلیک روی نقشه یا کشیدن نشانگر ⇐ عرض/طول با ۶ رقم اعشار (هم‌اندازه‌ی `Latitude`/`Longitude` بک‌اند).
 * تغییر دستی فیلدها نشانگر را جابه‌جا می‌کند. منبع کاشی با `VITE_MAP_TILE_URL` و `VITE_MAP_ATTRIBUTION` قابل تغییر است.
 */
const TILE_URL = (import.meta.env.VITE_MAP_TILE_URL as string | undefined) || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION = (import.meta.env.VITE_MAP_ATTRIBUTION as string | undefined) || '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
const IRAN: L.LatLngTuple = [32.4, 53.7];
const PIN = L.divIcon({ className: s.mapPin ?? '', html: '<span></span>', iconSize: [28, 38], iconAnchor: [14, 36] });

export default function LocationPicker({ lat, lng, onChange }: { lat: string; lng: string; onChange: (lat: string, lng: string) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const marker = useRef<L.Marker | null>(null);
  const cb = useRef(onChange);
  cb.current = onChange;
  const [tileErr, setTileErr] = useState(false);
  const [geoErr, setGeoErr] = useState<string | null>(null);

  const emit = (p: L.LatLng) => cb.current(toFaDigits(p.lat.toFixed(6)), toFaDigits(p.lng.toFixed(6)));
  const place = (p: L.LatLngExpression) => {
    if (!map.current) return;
    if (!marker.current) {
      marker.current = L.marker(p, { icon: PIN, draggable: true, keyboard: true, title: 'موقعیت شعبه' }).addTo(map.current);
      marker.current.on('dragend', () => emit(marker.current!.getLatLng()));
    } else marker.current.setLatLng(p);
  };

  useEffect(() => {
    if (!box.current || map.current) return;
    const la = parseCoord(lat); const ln = parseCoord(lng);
    const has = la !== null && ln !== null;
    const m = L.map(box.current, { center: has ? [la, ln] : IRAN, zoom: has ? 16 : 5, attributionControl: true });
    const layer = L.tileLayer(TILE_URL, { maxZoom: 19, attribution: ATTRIBUTION });
    let errors = 0;
    layer.on('tileerror', () => { errors += 1; if (errors >= 4) setTileErr(true); });
    layer.on('tileload', () => setTileErr(false));
    layer.addTo(m);
    m.attributionControl.setPrefix('<a href="https://leafletjs.com">Leaflet</a>');
    m.on('click', (e: L.LeafletMouseEvent) => { place(e.latlng); emit(e.latlng); });
    map.current = m;
    if (has) place([la, ln]);
    return () => { m.remove(); map.current = null; marker.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // فیلدهای دستی ⇐ نشانگر
  useEffect(() => {
    const la = parseCoord(lat); const ln = parseCoord(lng);
    if (!map.current) return;
    if (la === null || ln === null || la < -90 || la > 90 || ln < -180 || ln > 180) {
      if (!lat && !lng && marker.current) { marker.current.remove(); marker.current = null; }
      return;
    }
    const cur = marker.current?.getLatLng();
    if (!cur || Math.abs(cur.lat - la) > 1e-7 || Math.abs(cur.lng - ln) > 1e-7) {
      place([la, ln]);
      map.current.setView([la, ln], Math.max(map.current.getZoom(), 15));
    }
  }, [lat, lng]); // eslint-disable-line react-hooks/exhaustive-deps

  const locate = () => {
    setGeoErr(null);
    if (!navigator.geolocation) { setGeoErr('مرورگر شما موقعیت مکانی را پشتیبانی نمی‌کند.'); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => { const p = L.latLng(pos.coords.latitude, pos.coords.longitude); place(p); emit(p); map.current?.setView(p, 17); },
      () => setGeoErr('دسترسی به موقعیت مکانی داده نشد یا در دسترس نیست.'),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };

  return (
    <div className={s.mapPick}>
      <div ref={box} className={s.mapBox} dir="ltr" role="application" aria-label="نقشه‌ی انتخاب موقعیت شعبه؛ برای انتخاب روی نقشه کلیک کنید" />
      <div className={s.mapBar}>
        <span className={s.hint}>{tileErr ? 'نقشه بارگذاری نشد (اتصال به سرور نقشه)؛ مختصات را دستی وارد کنید.' : 'برای انتخاب، روی نقشه کلیک کنید یا نشانگر را بکشید.'}{geoErr ? ` ${geoErr}` : ''}</span>
        <span className={s.mapActs}>
          <Button type="button" variant="secondary" size="sm" icon={<IconCurrentLocation size={15} />} onClick={locate} data-tip="موقعیت فعلی من (مکان‌یاب مرورگر)">موقعیت فعلی</Button>
          <Button type="button" variant="ghost" size="sm" icon={<IconTrash size={15} />} onClick={() => cb.current('', '')} disabled={!lat && !lng} data-tip="حذف موقعیت شعبه">حذف موقعیت</Button>
        </span>
      </div>
    </div>
  );
}
