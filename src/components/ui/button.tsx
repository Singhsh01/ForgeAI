"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "group/btn relative inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-[transform,background-color,box-shadow,color,border-color] duration-300 ease-[var(--ease-cinema)] disabled:pointer-events-none disabled:opacity-45 active:scale-[0.97] [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // The one luminous action per screen
        primary:
          "luminous overflow-hidden rounded-full bg-[linear-gradient(120deg,rgba(255,154,130,0.95),rgba(242,84,127,0.95))] text-void shadow-[var(--glow-ember)] hover:shadow-[0_0_60px_-6px_rgba(255,154,130,0.8)] hover:-translate-y-px",
        glass: "glass rounded-full text-star hover:border-[var(--glass-line-strong)] hover:bg-white/10",
        ghost: "rounded-full text-haze hover:bg-white/[0.07] hover:text-star",
        danger: "rounded-full border border-danger/40 bg-danger/10 text-danger hover:bg-danger/20",
        approve: "rounded-full border border-aurora/40 bg-aurora/15 text-aurora hover:bg-aurora/25 hover:shadow-[0_0_30px_-8px_rgba(155,232,200,0.7)]",
      },
      size: {
        sm: "h-8 px-3.5 text-[13px]",
        md: "h-10 px-5 text-sm",
        lg: "h-12 px-7 text-[15px]",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: { variant: "glass", size: "md" },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild, loading, children, ...props }, ref) => {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} aria-busy={loading || undefined} {...props}>
      {asChild ? (
        children
      ) : (
        <>
          {variant === "primary" && (
            <span aria-hidden className="pointer-events-none absolute inset-0 -translate-x-full bg-[linear-gradient(100deg,transparent,rgba(255,255,255,0.45),transparent)] transition-transform duration-700 group-hover/btn:translate-x-full" />
          )}
          {loading && <span aria-hidden className="size-3.5 animate-spin rounded-full border-2 border-current border-r-transparent" />}
          <span className="relative z-[2] inline-flex items-center gap-2">{children}</span>
        </>
      )}
    </Comp>
  );
});
Button.displayName = "Button";
export { buttonVariants };
