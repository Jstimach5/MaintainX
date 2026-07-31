"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown } from "@/components/icons";

/**
 * Desktop primary navigation: the WAI-ARIA *disclosure navigation* pattern
 * (plain links inside a toggled panel), deliberately NOT role="menu" —
 * these are navigation links, not application menu commands.
 *
 * Role filtering happens on the server: unauthorized items never reach this
 * component, and a group that ends up with a single visible item arrives as
 * a plain link instead of a dropdown.
 */

export type NavLink = { href: string; label: string };
export type NavEntry =
  | { kind: "link"; label: string; href: string }
  | { kind: "group"; label: string; items: NavLink[] };

const triggerBase =
  "flex min-h-11 items-center gap-1 rounded-md px-3 py-2 text-sm font-medium whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-300";
const triggerIdle = "text-white/80 hover:bg-white/10 hover:text-white";
const triggerActive = "bg-white/10 text-brand-300";

export function PrimaryNav({ entries }: { entries: NavEntry[] }) {
  const pathname = usePathname();
  // The open panel is remembered with the route it was opened on, so a
  // navigation closes it by derivation — no effect chasing the pathname.
  const [opened, setOpened] = useState<{ label: string; path: string } | null>(
    null,
  );
  const open = opened?.path === pathname ? opened.label : null;
  const navRef = useRef<HTMLElement>(null);
  const triggerRefs = useRef(new Map<string, HTMLButtonElement>());
  const panelIdBase = useId();

  const close = () => setOpened(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!navRef.current?.contains(e.target as Node)) setOpened(null);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const trigger = triggerRefs.current.get(open);
      setOpened(null);
      trigger?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const isCurrent = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  return (
    <nav
      ref={navRef}
      aria-label="Primary"
      className="hidden min-w-0 flex-1 items-center gap-0.5 md:flex"
      onBlur={(e) => {
        // Tabbing out of the whole nav closes the panel; moving between the
        // trigger and its links does not.
        if (!e.currentTarget.contains(e.relatedTarget as Node)) close();
      }}
    >
      {entries.map((entry) => {
        if (entry.kind === "link") {
          const active = isCurrent(entry.href);
          return (
            <Link
              key={entry.href}
              href={entry.href}
              aria-current={active ? "page" : undefined}
              className={`${triggerBase} ${active ? triggerActive : triggerIdle}`}
            >
              {entry.label}
            </Link>
          );
        }

        const expanded = open === entry.label;
        const groupActive = entry.items.some((i) => isCurrent(i.href));
        const panelId = `${panelIdBase}-${entry.label}`;
        return (
          <div key={entry.label} className="relative">
            <button
              type="button"
              ref={(el) => {
                if (el) triggerRefs.current.set(entry.label, el);
                else triggerRefs.current.delete(entry.label);
              }}
              aria-expanded={expanded}
              aria-controls={panelId}
              onClick={() =>
                setOpened(expanded ? null : { label: entry.label, path: pathname })
              }
              className={`${triggerBase} ${groupActive || expanded ? triggerActive : triggerIdle}`}
            >
              {entry.label}
              <ChevronDown
                aria-hidden
                className={`h-4 w-4 transition-transform motion-reduce:transition-none ${
                  expanded ? "rotate-180" : ""
                }`}
              />
            </button>
            {expanded ? (
              <div
                id={panelId}
                className="absolute top-full left-0 z-50 mt-1 min-w-52 rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
              >
                {entry.items.map((item) => {
                  const active = isCurrent(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      onClick={close}
                      className={`block px-3 py-2 text-sm focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-600 ${
                        active
                          ? "bg-brand-50 font-semibold text-brand-800"
                          : "text-gray-700 hover:bg-brand-50 hover:text-brand-900"
                      }`}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            ) : null}
          </div>
        );
      })}
    </nav>
  );
}
