import { useReducerState } from "@litgit/ui/hooks/use-reducer-state";
import { cn } from "@litgit/ui/lib/utils";
import type * as React from "react";
import { useEffect } from "react";

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
  const [isLoaded, updateIsLoaded] = useReducerState(false);

  useEffect(() => {
    if (!src) {
      updateIsLoaded(false);
      return;
    }

    const imageConstructor = (globalThis as { Image?: PreloadImageConstructor })
      .Image;

    if (!imageConstructor) {
      updateIsLoaded(false);
      return;
    }

    let cancelled = false;
    const image = new imageConstructor();

    image.onload = () => {
      if (cancelled) {
        return;
      }

      updateIsLoaded(true);
    };

    image.onerror = () => {
      if (cancelled) {
        return;
      }

      updateIsLoaded(false);
    };

    image.src = src;

    return () => {
      cancelled = true;
    };
  }, [src, updateIsLoaded]);

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
