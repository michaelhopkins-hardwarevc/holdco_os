import type { ReactNode } from "react";

// Reusable Marmik building blocks so every screen shares the same eyebrow,
// heading, stat, panel, and spec-card treatments.

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <div className="font-mono text-[11px] tracking-[0.2em] text-acid uppercase">
      {"// "}
      {children}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  blurb,
  actions,
}: {
  eyebrow: string;
  title: string;
  blurb?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="max-w-[70ch]">
        <Eyebrow>{eyebrow}</Eyebrow>
        <h1 className="mt-2 font-display text-[31px] leading-none font-bold tracking-[-0.02em] text-bone">
          {title}
        </h1>
        {blurb && (
          <p className="mt-3 text-[14px] text-pretty text-alum">{blurb}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

// Accent color for stat underlines / bars.
type Accent = "acid" | "cyan" | "blaze" | "alum";
const ACCENT_BG: Record<Accent, string> = {
  acid: "bg-acid",
  cyan: "bg-cyan",
  blaze: "bg-blaze",
  alum: "bg-alum-2",
};

export function StatTile({
  label,
  value,
  note,
  accent = "cyan",
}: {
  label: string;
  value: string;
  note?: string;
  accent?: Accent;
}) {
  return (
    <div className="rounded-xl border border-line bg-graphite p-4">
      <div className="font-mono text-[10px] tracking-[0.1em] text-alum-2 uppercase">
        {label}
      </div>
      <div className="mt-2 font-mono text-[26px] leading-none font-medium text-bone">
        {value}
      </div>
      <div className={`mt-2 h-[2px] w-[34px] ${ACCENT_BG[accent]}`} />
      {note && <div className="mt-2 text-[12px] text-alum-2">{note}</div>}
    </div>
  );
}

export function Panel({
  title,
  right,
  children,
  className = "",
}: {
  title?: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`overflow-hidden rounded-xl border border-line bg-graphite ${className}`}>
      {title && (
        <div className="flex items-center justify-between border-b border-line bg-steel px-4 py-3">
          <div className="font-mono text-[10.5px] tracking-[0.1em] text-bone uppercase">
            {title}
          </div>
          {right && (
            <div className="font-mono text-[10px] tracking-[0.1em] text-alum-2 uppercase">
              {right}
            </div>
          )}
        </div>
      )}
      {children}
    </div>
  );
}

// The design system's signature object: acid band, title, dashed key/value rows.
export function SpecCard({
  label,
  rev = "REV_02",
  title,
  rows,
}: {
  label: string;
  rev?: string;
  title: string;
  rows: { k: string; v: string }[];
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-graphite">
      <div className="flex items-center justify-between bg-acid px-4 py-1.5">
        <span className="font-mono text-[10.5px] font-bold tracking-[0.1em] text-carbon uppercase">
          {label}
        </span>
        <span className="font-mono text-[10.5px] font-bold tracking-[0.1em] text-carbon uppercase">
          {rev}
        </span>
      </div>
      <div className="p-4">
        <div className="font-display text-[19px] font-bold tracking-[-0.02em] text-bone">
          {title}
        </div>
        <dl className="mt-3 flex flex-col">
          {rows.map((r) => (
            <div
              key={r.k}
              className="flex items-center justify-between border-b border-dashed border-line py-1.5 last:border-0"
            >
              <dt className="font-mono text-[12px] text-alum-2">{r.k}</dt>
              <dd className="font-mono text-[12px] text-bone">{r.v}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

// A labeled progress bar row (burn panels).
export function BurnRow({
  code,
  name,
  figure,
  pct,
  color,
}: {
  code: string;
  name: string;
  figure: string;
  pct: number;
  color: "cyan" | "blaze" | "acid";
}) {
  const barColor = color === "blaze" ? "bg-blaze" : color === "acid" ? "bg-acid" : "bg-cyan";
  const textColor = color === "blaze" ? "text-blaze" : color === "acid" ? "text-acid" : "text-cyan";
  return (
    <div className="border-b border-dashed border-line px-4 py-3 last:border-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-mono text-[11.5px] text-alum-2">{code}</span>
        <span className="flex-1 truncate text-[14px] text-bone">{name}</span>
        <span className={`font-mono text-[12px] ${textColor}`}>{figure}</span>
      </div>
      <div className="mt-2 h-[4px] overflow-hidden rounded-2xl bg-steel">
        <div
          className={`h-full rounded-2xl ${barColor}`}
          style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
        />
      </div>
    </div>
  );
}
