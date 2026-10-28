"use client";
/**
 * Primary navigation with active-page highlighting. Rendered twice by the
 * layout: as the desktop top-bar nav and as the phone bottom tab bar.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "./Icon";

interface NavItem {
  href: string;
  label: string;
  icon: IconName;
}

export const PRIMARY_NAV: NavItem[] = [
  { href: "/", label: "Feed", icon: "activity" },
  { href: "/calendar", label: "Calendar", icon: "calendar" },
  { href: "/companies", label: "Companies", icon: "building" },
  { href: "/insights", label: "Intelligence", icon: "sparkles" },
  { href: "/watchlist", label: "Watchlist", icon: "bookmark" },
];

const MORE_NAV: NavItem[] = [
  { href: "/global", label: "Global pharma", icon: "globe" },
  { href: "/patents", label: "Patent cliff", icon: "key" },
  { href: "/ipos", label: "IPO tracker", icon: "rocket" },
  { href: "/compare", label: "Compare companies", icon: "layers" },
  { href: "/digest", label: "Weekly digest", icon: "file-text" },
  { href: "/monitors", label: "Smart monitors", icon: "target" },
  { href: "/library", label: "Research library", icon: "book" },
  { href: "/explore", label: "Explore diseases", icon: "compass" },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function TopNav() {
  const pathname = usePathname() ?? "/";
  const moreActive = MORE_NAV.some((item) => isActive(pathname, item.href));
  return (
    <nav className="topnav" aria-label="Primary">
      {PRIMARY_NAV.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={isActive(pathname, item.href) ? "page" : undefined}
        >
          <Icon name={item.icon} size={15} />
          {item.label}
        </Link>
      ))}
      <details className="nav-more">
        <summary aria-current={moreActive ? "page" : undefined}>
          <Icon name="grid" size={15} />
          More
          <Icon name="chevron-down" size={13} />
        </summary>
        <div className="nav-more-menu">
          {MORE_NAV.map((item) => (
            <Link key={item.href} href={item.href} aria-current={isActive(pathname, item.href) ? "page" : undefined}>
              <span className="nav-more-icon"><Icon name={item.icon} size={15} /></span>
              {item.label}
            </Link>
          ))}
        </div>
      </details>
    </nav>
  );
}

const MOBILE_NAV: NavItem[] = [
  { href: "/", label: "Feed", icon: "activity" },
  { href: "/calendar", label: "Calendar", icon: "calendar" },
  { href: "/search", label: "Search", icon: "search" },
  { href: "/companies", label: "Companies", icon: "building" },
  { href: "/explore", label: "Explore", icon: "compass" },
];

export function BottomNav() {
  const pathname = usePathname() ?? "/";
  return (
    <nav className="bottomnav" aria-label="Primary (mobile)">
      {MOBILE_NAV.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined}>
            <span className="bottomnav-icon"><Icon name={item.icon} size={20} /></span>
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
