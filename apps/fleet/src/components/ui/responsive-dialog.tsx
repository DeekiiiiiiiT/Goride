"use client";

import * as React from "react";
import { useIsMobile } from "./use-mobile";
import { useVisualViewport } from "../../hooks/useVisualViewport";
import { cn } from "./utils";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
} from "./dialog";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "./drawer";

type ResponsiveDialogContextValue = {
  isMobile: boolean;
};

const ResponsiveDialogContext = React.createContext<ResponsiveDialogContextValue>({
  isMobile: false,
});

function useResponsiveDialog() {
  return React.useContext(ResponsiveDialogContext);
}

function ResponsiveDialog({
  children,
  ...props
}: React.ComponentProps<typeof Dialog>) {
  const isMobile = useIsMobile();
  const Root = isMobile ? Drawer : Dialog;

  return (
    <ResponsiveDialogContext.Provider value={{ isMobile }}>
      <Root {...props}>{children}</Root>
    </ResponsiveDialogContext.Provider>
  );
}

function ResponsiveDialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogTrigger>) {
  const { isMobile } = useResponsiveDialog();
  const Trigger = isMobile ? DrawerTrigger : DialogTrigger;
  return <Trigger data-slot="responsive-dialog-trigger" {...props} />;
}

function ResponsiveDialogClose({
  ...props
}: React.ComponentProps<typeof DialogClose>) {
  const { isMobile } = useResponsiveDialog();
  const Close = isMobile ? DrawerClose : DialogClose;
  return <Close data-slot="responsive-dialog-close" {...props} />;
}

const ResponsiveDialogContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof DialogContent> & {
    hideCloseButton?: boolean;
  }
>(({ className, children, hideCloseButton, style, ...props }, ref) => {
  const { isMobile } = useResponsiveDialog();
  const { keyboardInset } = useVisualViewport();

  if (isMobile) {
    return (
      <DrawerContent
        ref={ref}
        data-slot="responsive-dialog-content"
        className={cn(
          "max-h-[90dvh] gap-0 rounded-t-xl safe-x pb-[max(1rem,env(safe-area-inset-bottom,0px))]",
          className,
        )}
        style={{
          ...style,
          marginBottom: keyboardInset > 0 ? keyboardInset : undefined,
        }}
        {...props}
      >
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-1 pb-2 pt-1">
          {children}
        </div>
      </DrawerContent>
    );
  }

  return (
    <DialogContent
      ref={ref}
      data-slot="responsive-dialog-content"
      hideCloseButton={hideCloseButton}
      className={className}
      style={style}
      {...props}
    >
      {children}
    </DialogContent>
  );
});
ResponsiveDialogContent.displayName = "ResponsiveDialogContent";

function ResponsiveDialogHeader({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const { isMobile } = useResponsiveDialog();
  if (isMobile) {
    return (
      <DrawerHeader
        data-slot="responsive-dialog-header"
        className={cn("text-left", className)}
        {...props}
      />
    );
  }
  return (
    <DialogHeader
      data-slot="responsive-dialog-header"
      className={className}
      {...props}
    />
  );
}

function ResponsiveDialogFooter({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const { isMobile } = useResponsiveDialog();
  if (isMobile) {
    return (
      <DrawerFooter
        data-slot="responsive-dialog-footer"
        className={cn("gap-2", className)}
        {...props}
      />
    );
  }
  return (
    <DialogFooter
      data-slot="responsive-dialog-footer"
      className={className}
      {...props}
    />
  );
}

const ResponsiveDialogTitle = React.forwardRef<
  HTMLHeadingElement,
  React.ComponentPropsWithoutRef<typeof DialogTitle>
>(({ className, ...props }, ref) => {
  const { isMobile } = useResponsiveDialog();
  if (isMobile) {
    return (
      <DrawerTitle
        ref={ref}
        data-slot="responsive-dialog-title"
        className={cn("text-lg font-semibold", className)}
        {...props}
      />
    );
  }
  return (
    <DialogTitle
      ref={ref}
      data-slot="responsive-dialog-title"
      className={className}
      {...props}
    />
  );
});
ResponsiveDialogTitle.displayName = "ResponsiveDialogTitle";

const ResponsiveDialogDescription = React.forwardRef<
  HTMLParagraphElement,
  React.ComponentPropsWithoutRef<typeof DialogDescription>
>(({ className, ...props }, ref) => {
  const { isMobile } = useResponsiveDialog();
  if (isMobile) {
    return (
      <DrawerDescription
        ref={ref}
        data-slot="responsive-dialog-description"
        className={className}
        {...props}
      />
    );
  }
  return (
    <DialogDescription
      ref={ref}
      data-slot="responsive-dialog-description"
      className={className}
      {...props}
    />
  );
});
ResponsiveDialogDescription.displayName = "ResponsiveDialogDescription";

export {
  ResponsiveDialog,
  ResponsiveDialogClose,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogTrigger,
  DialogOverlay as ResponsiveDialogOverlay,
  DialogPortal as ResponsiveDialogPortal,
};
