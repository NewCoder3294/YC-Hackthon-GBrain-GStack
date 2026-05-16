import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "h-9 w-full border border-neutral-200 bg-white px-3 font-mono text-sm placeholder:text-neutral-300 focus:border-black focus:outline-none",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";
