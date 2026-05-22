"use client";

import { Toaster as Sonner, type ToasterProps } from "sonner";

function Toaster(props: ToasterProps) {
  return (
    <Sonner
      richColors
      closeButton
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast: "bg-popover text-popover-foreground border-border",
          description: "text-muted-foreground",
        },
      }}
      {...props}
    />
  );
}

export { Toaster };
