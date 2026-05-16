import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center font-mono text-xs uppercase tracking-widest transition-colors disabled:opacity-40 disabled:pointer-events-none focus-visible:outline focus-visible:outline-1 focus-visible:outline-black",
  {
    variants: {
      variant: {
        primary: "bg-black text-white hover:bg-neutral-700",
        secondary: "border border-neutral-300 bg-white text-black hover:border-black",
        ghost: "text-neutral-500 hover:text-black",
      },
      size: {
        sm: "h-7 px-2",
        md: "h-9 px-3",
        lg: "h-11 px-4",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  ),
);
Button.displayName = "Button";
