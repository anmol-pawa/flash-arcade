"use client";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { ReactNode } from "react";
import { sfx } from "@/game/audio/synth";
import type { Dialect } from "@/lib/dialect/lint";

type Variant = "primary" | "ghost" | "danger" | "gold";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-[var(--accent)] text-[#06040d] shadow-[0_0_30px_-6px_var(--accent)] hover:brightness-110",
  ghost: "bg-white/5 text-white/90 border border-white/10 hover:bg-white/10",
  danger: "bg-rose-500/90 text-white hover:bg-rose-500",
  gold: "bg-amber-300 text-[#1a1203] shadow-[0_0_30px_-6px_#fcd34d] hover:brightness-110",
};

export function Button({
  children,
  onClick,
  variant = "ghost",
  disabled,
  className = "",
  title,
  size = "md",
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: Variant;
  disabled?: boolean;
  className?: string;
  title?: string;
  size?: "sm" | "md" | "lg";
  type?: "button" | "submit";
}) {
  const sz = size === "sm" ? "px-3 py-1.5 text-xs" : size === "lg" ? "px-7 py-3.5 text-base" : "px-4 py-2 text-sm";
  return (
    <motion.button
      type={type}
      title={title}
      whileHover={disabled ? undefined : { y: -2, scale: 1.02 }}
      whileTap={disabled ? undefined : { scale: 0.96 }}
      onHoverStart={() => !disabled && sfx.hover()}
      onClick={() => {
        if (disabled) return;
        sfx.click();
        onClick?.();
      }}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-semibold tracking-wide transition-[filter,background-color] disabled:cursor-not-allowed disabled:opacity-40 ${sz} ${VARIANTS[variant]} ${className}`}
    >
      {children}
    </motion.button>
  );
}

/** A link that looks like a Button (never nest a <button> in an <a>). */
export function LinkButton({ href, children, variant = "ghost", size = "md", className = "", onClick }: { href: string; children: ReactNode; variant?: Variant; size?: "sm" | "md" | "lg"; className?: string; onClick?: () => void }) {
  const sz = size === "sm" ? "px-3 py-1.5 text-xs" : size === "lg" ? "px-7 py-3.5 text-base" : "px-4 py-2 text-sm";
  return (
    <Link
      href={href}
      onMouseEnter={() => sfx.hover()}
      onClick={() => {
        sfx.click();
        onClick?.();
      }}
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-semibold tracking-wide transition-[filter,background-color,transform] hover:-translate-y-0.5 active:scale-95 ${sz} ${VARIANTS[variant]} ${className}`}
    >
      {children}
    </Link>
  );
}

export function NavLink({ href, children, className = "" }: { href: string; children: ReactNode; className?: string }) {
  return (
    <Link href={href} onMouseEnter={() => sfx.hover()} onClick={() => sfx.click()} className={`text-sm text-white/60 transition-colors hover:text-white ${className}`}>
      {children}
    </Link>
  );
}

export function Bar({ value, max, color, label, align = "left", danger = 0.3, height = 14 }: { value: number; max: number; color: string; label?: string; align?: "left" | "right"; danger?: number; height?: number }) {
  const pct = Math.max(0, Math.min(1, value / max));
  const low = pct <= danger;
  return (
    <div className="w-full">
      {label && (
        <div className={`mb-1 flex min-w-0 items-baseline gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/60 ${align === "right" ? "flex-row-reverse" : ""}`}>
          <span className="truncate">{label}</span>
          <span className="shrink-0 font-mono text-white/80 tabular-nums">
            {Math.max(0, Math.round(value))}/{max}
          </span>
        </div>
      )}
      <div className="relative overflow-hidden rounded-full border border-white/10 bg-black/50" style={{ height }}>
        {/* lag bar: shows recent damage */}
        <motion.div
          className={`absolute inset-y-0 bg-white/40 ${align === "right" ? "right-0" : "left-0"}`}
          animate={{ width: `${pct * 100}%` }}
          transition={{ duration: 0.9, delay: 0.35, ease: "easeOut" }}
        />
        <motion.div
          className={`absolute inset-y-0 ${align === "right" ? "right-0" : "left-0"}`}
          style={{ background: low ? "linear-gradient(90deg,#f43f5e,#fb7185)" : `linear-gradient(90deg, ${color}, color-mix(in oklab, ${color} 60%, white))`, boxShadow: `0 0 16px ${low ? "#f43f5e" : color}` }}
          animate={{ width: `${pct * 100}%` }}
          transition={{ type: "spring", stiffness: 140, damping: 20 }}
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.25),transparent_55%)]" />
      </div>
    </div>
  );
}

export function Chip({ children, color, className = "" }: { children: ReactNode; color?: string; className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tracking-wide ${className}`}
      style={{ borderColor: color ? `${color}55` : "rgba(255,255,255,0.12)", color: color ?? "rgba(255,255,255,0.75)", background: color ? `${color}14` : "rgba(255,255,255,0.04)" }}
    >
      {children}
    </span>
  );
}

export function DialectToggle({ value, onChange, disabled }: { value: Dialect; onChange: (d: Dialect) => void; disabled?: boolean }) {
  const opts: { id: Dialect; label: string; color: string }[] = [
    { id: "postgres", label: "PostgreSQL", color: "#60a5fa" },
    { id: "oracle", label: "Oracle", color: "#f87171" },
  ];
  return (
    <div className="relative inline-flex shrink-0 rounded-xl border border-white/10 bg-black/40 p-1" role="radiogroup" aria-label="SQL dialect">
      {opts.map((o) => (
        <button
          key={o.id}
          role="radio"
          aria-checked={value === o.id}
          disabled={disabled}
          onClick={() => {
            sfx.click();
            onChange(o.id);
          }}
          className="relative z-10 px-2.5 py-1.5 text-xs font-bold tracking-wide transition-colors disabled:cursor-not-allowed sm:px-3"
          style={{ color: value === o.id ? "#0b0718" : "rgba(255,255,255,0.7)" }}
        >
          {value === o.id && <motion.span layoutId="dialect-pill" className="absolute inset-0 -z-10 rounded-lg" style={{ background: o.color, boxShadow: `0 0 20px -4px ${o.color}` }} transition={{ type: "spring", stiffness: 400, damping: 30 }} />}
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Modal({ open, children, onClose, wide }: { open: boolean; children: ReactNode; onClose?: () => void; wide?: boolean }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-[#05030d]/80" onClick={onClose} />
          <motion.div
            className={`panel relative max-h-[90vh] w-full overflow-y-auto scroll-thin p-6 ${wide ? "max-w-4xl" : "max-w-xl"}`}
            initial={{ y: 40, scale: 0.94, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: 20, scale: 0.97, opacity: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 24 }}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Render `code` spans and **bold** in mission text. */
export function RichText({ text }: { text: string }) {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("`") ? (
          <code key={i} className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[0.9em] text-[var(--accent)]">
            {p.slice(1, -1)}
          </code>
        ) : p.startsWith("**") ? (
          <strong key={i} className="font-semibold text-white">
            {p.slice(2, -2)}
          </strong>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

export function CodeBlock({ code, label, color }: { code: string; label?: string; color?: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-black/50">
      {label && (
        <div className="border-b border-white/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: color ?? "rgba(255,255,255,0.5)" }}>
          {label}
        </div>
      )}
      {/* wraps on phones so the SQL is readable without sideways scrolling */}
      <pre className="overflow-x-auto p-3 font-mono text-[12.5px] leading-relaxed break-words whitespace-pre-wrap text-white/85 scroll-thin sm:whitespace-pre">{code}</pre>
    </div>
  );
}

export const DIALECT_COLOR: Record<Dialect, string> = { postgres: "#60a5fa", oracle: "#f87171" };
export const DIALECT_NAME: Record<Dialect, string> = { postgres: "PostgreSQL", oracle: "Oracle" };
