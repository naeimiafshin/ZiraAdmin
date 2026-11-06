import { useEffect, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router';
import { IconChevronsLeft, IconChevronsRight, IconLayoutGrid } from '@tabler/icons-react';
import { useAuth } from '@/shared/auth/useAuth';
import { BrandMark } from '@/shared/ui/BrandMark';
import { useToast } from '@/shared/ui/toast';
import { iconFor } from './navConfig';
import { MegaMenu } from './MegaMenu';
import { findCurrent, useNav, type NavGroup } from './useNav';
import { useNavBadges } from './useNavBadges';
import { toFaDigits } from '@/shared/lib/text';
import s from './Nav.module.css';

type Drawer = 'main' | 'sub';
const drawerKey = (userId: string) => `zm.admin.navDrawer.${userId}`;
const readDrawer = (userId: string | undefined): Drawer => {
  if (!userId) return 'sub';
  try {
    return localStorage.getItem(drawerKey(userId)) === 'main' ? 'main' : 'sub';
  } catch {
    return 'sub';
  }
};

/**
 * سایدبار دوکشویی با عرض ثابت (قاب مطابق طرح «1»):
 *   کشوی منوی اصلی (۱۵ منوی IA) به سمت چپ باز می‌شود و کشوی زیرمنو را می‌بندد؛
 *   کشوی زیرمنو (صفحه‌های ماژول فعال، بخش‌بندی html) به سمت راست باز می‌شود و منوی اصلی را جمع می‌کند.
 *   کلیک روی سربرگ زیرمنو ⇐ مگامنو (همه‌ی ماژول‌ها و صفحه‌ها).
 */
export function Nav() {
  const { user } = useAuth();
  const badges = useNavBadges();
  const { groups, isLoading, isError, refetch } = useNav();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const current = findCurrent(groups, pathname);
  const [megaOpen, setMegaOpen] = useState(false);
  const [drawer, setDrawerState] = useState<Drawer>(() => readDrawer(user?.id));
  // ماژولی که کاربر انتخاب کرده ولی هنوز صفحه‌اش را باز نکرده
  const [peek, setPeek] = useState<string | null>(null);
  useEffect(() => { setPeek(null); }, [pathname]);
  useEffect(() => { setDrawerState(readDrawer(user?.id)); }, [user?.id]);

  const setDrawer = (d: Drawer) => {
    setDrawerState(d);
    try {
      if (user) localStorage.setItem(drawerKey(user.id), d);
    } catch {
      /* حافظه‌ی مرورگر در دسترس نیست؛ فقط همین نشست */
    }
  };

  const activeCode = peek ?? current?.group.code ?? (pathname === '/' ? 'dashboard' : null);
  const active = groups.find((g) => g.code === activeCode) ?? groups[0] ?? null;
  const main = groups.filter((g) => g.code !== 'settings');
  const settings = groups.find((g) => g.code === 'settings');

  const pick = (g: NavGroup) => {
    if (g.notBuilt) {
      toast('این ماژول هنوز در سامانه ساخته نشده است.', 'error');
      return;
    }
    setPeek(g.code);
    if (g.firstRoute) navigate(g.firstRoute);
    // ماژول بدون زیرمنو (داشبورد) کشو را عوض نمی‌کند؛ بقیه زیرمنو را باز می‌کنند
    if (drawer === 'main' && !g.route) setDrawer('sub');
  };

  const railBtn = (g: NavGroup) => {
    const on = g.code === active?.code;
    const gCount = g.items.reduce((n, i) => n + (badges[i.key] ?? 0), 0);
    return (
      <button
        key={g.code}
        type="button"
        className={`${s.railBtn} ${on ? s.railOn : ''} ${g.notBuilt ? s.railOff : ''}`}
        onClick={() => pick(g)}
        aria-label={g.name}
        aria-current={on ? 'page' : undefined}
        data-tip={drawer === 'main' ? '' : g.notBuilt ? `${g.name} (به‌زودی)` : g.name}
        data-tip-pos="left"
      >
        <span className={s.railIcon}><g.icon size={23} stroke={1.6} />{gCount ? <span className={s.railDot} aria-label={`${toFaDigits(gCount)} خوانده‌نشده`} /> : null}</span>
        <span className={s.railText}>
          <span className={s.railName}>{g.name}</span>
          <span className={s.railSub}>{g.notBuilt ? 'به‌زودی' : g.sub}</span>
        </span>
      </button>
    );
  };

  const isMain = drawer === 'main';
  return (
    <>
      <aside className={`${s.side} ${isMain ? s.sideMain : ''}`} aria-label="منوی پنل">
        <div className={s.rail}>
          <div className={s.railHead}>
            <span className={s.logoTile} aria-hidden><BrandMark size={26} /></span>
            <span className={s.railTitle}>منوی اصلی</span>
          </div>
          <button
            type="button"
            className={s.drawerBtn}
            onClick={() => setDrawer(isMain ? 'sub' : 'main')}
            aria-label={isMain ? 'باز کردن زیرمنو' : 'باز کردن منوی اصلی'}
            aria-expanded={isMain}
            data-tip-pos="left"
          >
            <span className={s.railIcon}>{isMain ? <IconChevronsRight size={19} stroke={1.8} /> : <IconChevronsLeft size={19} stroke={1.8} />}</span>
            <span className={s.railText}><span className={s.drawerLabel}>باز کردن زیرمنو</span></span>
          </button>
          <div className={s.railList}>{main.map(railBtn)}</div>
          {settings ? <div className={s.railBottom}>{railBtn(settings)}</div> : null}
        </div>

        <div className={s.panel} aria-hidden={isMain}>
          <div className={s.panelCard}>
            {active ? (
              <button type="button" className={s.moduleHead} onClick={() => setMegaOpen(true)} aria-label="همه‌ی ماژول‌ها" tabIndex={isMain ? -1 : 0}>
                <span className={s.moduleTile}><active.icon size={22} stroke={1.7} /></span>
                <span className={s.moduleText}>
                  <span className={s.moduleName}>{active.name}</span>
                  <span className={s.moduleSub}>{active.sub}</span>
                </span>
                <IconLayoutGrid size={17} className={s.moduleGrid} />
              </button>
            ) : <div className={s.moduleHead} />}
            <nav className={s.panelNav} aria-label="صفحه‌های ماژول">
              {isLoading ? (
                Array.from({ length: 5 }, (_, i) => <div key={i} className={s.skel} />)
              ) : isError ? (
                <div className={s.state}>منو دریافت نشد.<button type="button" className={s.link} onClick={() => refetch()}>تلاش دوباره</button></div>
              ) : !active ? null : active.notBuilt ? (
                <div className={s.state}>این ماژول هنوز در سامانه ساخته نشده است.</div>
              ) : active.route ? (
                <NavLink to={active.route} end tabIndex={isMain ? -1 : 0} className={({ isActive }) => `${s.item} ${isActive ? s.itemOn : ''}`}>
                  <active.icon size={19} stroke={1.7} /><span>{active.name}</span>
                </NavLink>
              ) : (
                active.sections.map((sec) => (
                  <div key={sec.title} className={s.section}>
                    <div className={s.sectionTitle}>{sec.title}</div>
                    {sec.items.map((it) => {
                      const Icon = iconFor(it.icon);
                      if (it.soon) return (
                        <div key={it.key} className={`${s.item} ${s.itemSoon}`} aria-disabled="true" data-tip="این صفحه هنوز در سامانه ساخته نشده است">
                          <Icon size={19} stroke={1.7} /><span>{it.name}</span><span className={s.soon}>به‌زودی</span>
                        </div>
                      );
                      return (
                        <NavLink key={it.key} to={it.route} end tabIndex={isMain ? -1 : 0} className={({ isActive }) => `${s.item} ${it.sub ? s.itemSub : ''} ${isActive || current?.leaf?.key === it.key ? s.itemOn : ''}`}>
                          {it.sub ? <span className={s.subMark} aria-hidden>└</span> : null}<Icon size={it.sub ? 17 : 19} stroke={1.7} /><span>{it.name}</span>
                          {badges[it.key] ? <span className={s.count} aria-label={`${toFaDigits(badges[it.key]!)} خوانده‌نشده`}>{toFaDigits(badges[it.key]! > 99 ? '99+' : badges[it.key]!)}</span> : null}
                        </NavLink>
                      );
                    })}
                  </div>
                ))
              )}
            </nav>
          </div>
        </div>
      </aside>
      {megaOpen ? <MegaMenu groups={groups} activeCode={active?.code ?? null} onClose={() => setMegaOpen(false)} /> : null}
    </>
  );
}
