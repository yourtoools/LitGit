import { cn } from "@litgit/ui/lib/utils";
import type * as React from "react";
import { useEffect, useState } from "react";

interface PreloadImage {
  onerror: (() => void) | null;
  onload: (() => void) | null;
  src: string;
}

type PreloadImageConstructor = new () => PreloadImage;

function Avatar({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 overflow-hidden rounded-full align-middle",
        className
      )}
      data-slot="avatar"
      {...props}
    />
  );
}

function AvatarImage({
  alt,
  className,
  height = 32,
  src,
  width = 32,
  ...props
}: React.ComponentProps<"img">) {
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    if (!src) {
      setIsLoaded(false);
      return;
    }

    const imageConstructor = (globalThis as { Image?: PreloadImageConstructor })
      .Image;

    if (!imageConstructor) {
      setIsLoaded(false);
      return;
    }

    let cancelled = false;
    const image = new imageConstructor();

    image.onload = () => {
      if (cancelled) {
        return;
      }

      setIsLoaded(true);
    };

    image.onerror = () => {
      if (cancelled) {
        return;
      }

      setIsLoaded(false);
    };

    image.src = src;

    return () => {
      cancelled = true;
    };
  }, [src]);

  if (!(src && isLoaded)) {
    return null;
  }

  return (
    <img
      alt={alt}
      className={cn("h-full w-full object-cover", className)}
      data-slot="avatar-image"
      height={height}
      src={src}
      width={width}
      {...props}
    />
  );
}

function AvatarFallback({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "flex h-full w-full items-center justify-center bg-muted text-muted-foreground",
        className
      )}
      data-slot="avatar-fallback"
      {...props}
    />
  );
}

export { Avatar, AvatarFallback, AvatarImage };
