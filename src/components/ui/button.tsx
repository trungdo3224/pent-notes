import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 cursor-pointer select-none",
  {
    variants: {
      variant: {
        default:
          "border border-[var(--forest)] bg-[var(--forest)] text-[var(--button-text)] font-semibold shadow-sm hover:bg-[var(--primary-hover)] hover:border-[var(--primary-hover)] active:opacity-95",
        destructive:
          "border border-[var(--danger)] bg-destructive text-destructive-foreground shadow-sm hover:opacity-90 active:opacity-95",
        outline:
          "border border-[var(--line)] bg-[var(--surface-muted)] text-[var(--text-primary)] shadow-sm hover:bg-[var(--hover)] hover:border-[var(--line-strong)] hover:text-[var(--ink)]",
        secondary:
          "border border-[var(--line)] bg-secondary text-secondary-foreground shadow-sm hover:bg-accent hover:text-accent-foreground",
        ghost:
          "border-0 bg-transparent text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--ink)] active:bg-[var(--selected)]",
        link: "border-0 bg-transparent text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 rounded-md px-8",
        icon: "h-8 w-8",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
