"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { selectEntity } from "@/lib/actions/active-entity";
import type { MembershipInfo } from "@/lib/auth";

type Command = {
  kind: string;
  label: string;
  hint?: string;
  run: () => void;
};

const NAV: { label: string; href: string }[] = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Timesheet", href: "/timesheet" },
  { label: "Approvals", href: "/approvals" },
  { label: "Expenses", href: "/expenses" },
  { label: "Projects", href: "/projects" },
  { label: "Invoices", href: "/invoices" },
  { label: "Reports", href: "/reports" },
  { label: "Clients", href: "/clients" },
  { label: "Resources", href: "/resources" },
  { label: "Indirect codes", href: "/indirect-codes" },
  { label: "Import", href: "/import" },
  { label: "Connections", href: "/connections" },
  { label: "Entities", href: "/entities" },
  { label: "Account", href: "/account" },
];

export function CommandPalette({ memberships }: { memberships: MembershipInfo[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("cmdk:open", onOpen as EventListener);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("cmdk:open", onOpen as EventListener);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setQ("");
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const commands = useMemo<Command[]>(() => {
    const go = (href: string) => () => {
      setOpen(false);
      router.push(href);
    };
    const nav: Command[] = NAV.map((n) => ({
      kind: "GO",
      label: n.label,
      hint: n.href,
      run: go(n.href),
    }));
    const entities: Command[] = memberships.map((m) => ({
      kind: "ENTITY",
      label: `Switch to ${m.entityName}`,
      hint: m.role,
      run: () => {
        setOpen(false);
        selectEntity(m.entityId);
      },
    }));
    return [...nav, ...entities];
  }, [memberships, router]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return commands;
    return commands.filter(
      (c) => c.label.toLowerCase().includes(s) || c.kind.toLowerCase().includes(s),
    );
  }, [commands, q]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-[rgba(12,14,16,0.72)] pt-[14vh]"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-[620px] max-w-[92vw] overflow-hidden rounded-xl border border-line bg-graphite"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <span className="font-mono text-acid">›</span>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, filtered.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                filtered[active]?.run();
              }
            }}
            placeholder="Search screens and entities…"
            className="flex-1 bg-transparent text-[15px] text-bone outline-none placeholder:text-alum-2"
          />
          <span className="rounded border border-line px-1 font-mono text-[10px] text-alum-2">
            ESC
          </span>
        </div>
        <div className="max-h-[50vh] overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <div className="px-4 py-3 text-[13px] text-alum-2">No matches.</div>
          ) : (
            filtered.map((c, i) => (
              <button
                key={`${c.kind}:${c.label}`}
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => c.run()}
                className={`flex w-full items-center gap-3 border-b border-dashed border-line px-4 py-2.5 text-left last:border-0 ${
                  i === active ? "bg-steel" : ""
                }`}
              >
                <span className="rounded-[5px] border border-line px-1.5 py-0.5 font-mono text-[9.5px] tracking-[0.1em] text-alum-2 uppercase">
                  {c.kind}
                </span>
                <span className="flex-1 text-[13.5px] text-bone">{c.label}</span>
                {c.hint && (
                  <span className="font-mono text-[10.5px] text-alum-2">{c.hint}</span>
                )}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
