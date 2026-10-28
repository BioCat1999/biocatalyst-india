/**
 * Shared page building blocks for the redesigned pages: a colored hero band,
 * hero stat tiles, icon section titles and company avatars.
 */
import type { CSSProperties, ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

export function PageHero({
  kicker,
  title,
  children,
  aside,
  accent = "#00b5a6",
  breadcrumb,
}: {
  kicker: string;
  title: ReactNode;
  children?: ReactNode;
  aside?: ReactNode;
  /** Glow color in the top-right corner. */
  accent?: string;
  breadcrumb?: ReactNode;
}) {
  return (
    <section className="page-hero" style={{ "--accent": accent } as CSSProperties}>
      <div className="page-hero-copy">
        {breadcrumb && <nav className="breadcrumb" aria-label="Breadcrumb">{breadcrumb}</nav>}
        <span className="page-hero-kicker">{kicker}</span>
        <h1>{title}</h1>
        {children}
      </div>
      {aside && <div className="page-hero-aside">{aside}</div>}
    </section>
  );
}

export function HeroTile({ icon, value, label, color }: { icon: IconName; value: ReactNode; label: string; color: string }) {
  return (
    <div className="hero-tile">
      <Icon name={icon} size={16} style={{ color }} />
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

export function PanelTitle({
  icon,
  color,
  soft,
  children,
  right,
}: {
  icon: IconName;
  color: string;
  soft: string;
  children: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="panel-title">
      <span style={{ background: soft, color }}><Icon name={icon} size={15} /></span>
      <h2>{children}</h2>
      {right && <div className="panel-title-right">{right}</div>}
    </div>
  );
}

const AVATAR_COLORS = ["#007f7a", "#1f63d6", "#6d4bd8", "#c2335f", "#9a6a00", "#1c7a3d", "#12406b", "#b45309"];

/** Colored initials badge; the color is stable per company name. */
export function Avatar({ name, size = 44 }: { name: string; size?: number }) {
  const words = name.replace(/\b(ltd|limited|inc|plc|pvt|private|the|co)\b\.?/gi, "").trim().split(/\s+/).filter(Boolean);
  const initials = ((words[0]?.[0] ?? "") + (words[1]?.[0] ?? "")).toUpperCase() || "?";
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const color = AVATAR_COLORS[hash % AVATAR_COLORS.length];
  return (
    <span
      className="avatar"
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.36),
        borderRadius: Math.round(size * 0.32),
        background: `color-mix(in srgb, ${color} 14%, #fff)`,
        color,
      }}
    >
      {initials}
    </span>
  );
}
