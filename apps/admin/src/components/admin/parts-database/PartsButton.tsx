import * as React from "react";
import { cn } from "../../ui/utils";

export type PartsButtonVariant = "primary" | "secondary" | "danger" | "icon";

export type PartsButtonProps = React.ComponentPropsWithoutRef<"button"> & {
  variant?: PartsButtonVariant;
  /** Solid red fill for final confirm in overlays */
  confirm?: boolean;
};

export const PartsButton = React.forwardRef<HTMLButtonElement, PartsButtonProps>(
  ({ variant = "secondary", confirm = false, className, type = "button", ...props }, ref) => {
    const variantClass =
      variant === "primary"
        ? "parts-btn--primary"
        : variant === "danger"
          ? confirm
            ? "parts-btn--danger-confirm"
            : "parts-btn--danger"
          : variant === "icon"
            ? "parts-btn--icon"
            : "parts-btn--secondary";

    return (
      <button
        ref={ref}
        type={type}
        className={cn("parts-btn", variantClass, className)}
        {...props}
      />
    );
  },
);
PartsButton.displayName = "PartsButton";
