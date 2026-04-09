import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@src/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground",
        secondary:
          "border-transparent bg-secondary/15 text-secondary",
        outline:
          "border-border text-foreground",
        success:
          "border-transparent bg-success/15 text-success",
        warning:
          "border-transparent bg-warning/15 text-warning",
        destructive:
          "border-transparent bg-destructive/15 text-destructive",
        // Error-type variants for analysis results
        syntax:
          "border-transparent bg-destructive/15 text-destructive",
        tool_usage:
          "border-transparent bg-warning/15 text-warning",
        config:
          "border-transparent bg-secondary/15 text-secondary",
        unknown:
          "border-transparent bg-muted text-muted-foreground",
        // Status variants
        stalled:
          "border-transparent bg-warning/15 text-warning",
        critical:
          "border-transparent bg-destructive/15 text-destructive",
        resolved:
          "border-transparent bg-success/15 text-success",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
