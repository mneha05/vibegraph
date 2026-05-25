"use client";
import { type ButtonHTMLAttributes, forwardRef } from "react";
import { clsx } from "clsx";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "ghost" | "soft" | "danger";
  size?: "sm" | "md";
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "ghost", size = "md", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      className={clsx(
        "inline-flex items-center gap-1.5 font-medium transition-colors duration-100",
        "border rounded focus-visible:outline-amber",
        size === "sm" ? "h-7 px-2 text-xs" : "h-8 px-3 text-[13px]",
        variant === "primary" &&
          "bg-amber text-ink-900 border-amber hover:bg-amber-soft",
        variant === "soft" &&
          "bg-ink-700 text-ink-50 border-ink-600 hover:bg-ink-600 hover:border-ink-500",
        variant === "ghost" &&
          "bg-transparent text-ink-100 border-ink-600 hover:bg-ink-700 hover:border-ink-500",
        variant === "danger" &&
          "bg-transparent text-rose border-rose/40 hover:bg-rose/10",
        className,
      )}
      {...rest}
    />
  );
});
