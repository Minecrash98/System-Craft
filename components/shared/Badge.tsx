import type { ReactNode } from "react";

type BadgeTone =
  | "neutral"
  | "input"
  | "processing"
  | "model"
  | "data"
  | "review"
  | "warning"
  | "danger";

interface BadgeProps {
  children: ReactNode;
  tone?: BadgeTone;
  title?: string;
}

const toneClasses: Record<BadgeTone, string> = {
  neutral: "border-slate-200 bg-slate-50 text-slate-700",
  input: "border-sky-200 bg-sky-50 text-sky-700",
  processing: "border-indigo-200 bg-indigo-50 text-indigo-700",
  model: "border-violet-200 bg-violet-50 text-violet-700",
  data: "border-emerald-200 bg-emerald-50 text-emerald-700",
  review: "border-amber-200 bg-amber-50 text-amber-800",
  warning: "border-orange-200 bg-orange-50 text-orange-800",
  danger: "border-rose-200 bg-rose-50 text-rose-700"
};

export function Badge({ children, tone = "neutral", title }: BadgeProps) {
  return (
    <span
      className={`inline-flex max-w-full items-center rounded border px-2 py-0.5 text-[11px] font-semibold leading-5 ${toneClasses[tone]}`}
      title={title}
    >
      {children}
    </span>
  );
}
