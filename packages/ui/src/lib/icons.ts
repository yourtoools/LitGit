import {
  Activity,
  Bell,
  Cable,
  Circle,
  CreditCard,
  Gauge,
  Key,
  LayoutDashboard,
  LifeBuoy,
  type LucideIcon,
  Monitor,
  Palette,
  Send,
  Settings,
  UserCog,
  Users,
  Video,
  Wrench,
  Youtube,
} from "lucide-react";
import type { LucideIconName } from "../components/atoms/lucide-icons";
import { lucideIconMap } from "../components/atoms/lucide-icons";

/**
 * Direct icon component map - no namespace imports needed
 */
const iconComponents: Record<string, LucideIcon> = {
  Activity,
  Cable,
  Gauge,
  Settings,
  LifeBuoy,
  Send,
  Circle,
  LayoutDashboard,
  Users,
  Video,
  Youtube,
  CreditCard,
  UserCog,
  Wrench,
  Palette,
  Bell,
  Monitor,
  Key,
};

/**
 * Type guard for Lucide icon name validation
 */
export function isLucideIconName(name: string): name is LucideIconName {
  return name in lucideIconMap;
}

/**
 * Get a Lucide icon component by name (synchronous)
 * @param iconName - Name of the Lucide icon in kebab-case (e.g., "layout-dashboard")
 * @returns The icon component
 * @throws {Error} If the icon is not found or fails to load
 */
export function getLucideIcon(iconName: LucideIconName): LucideIcon {
  if (!isLucideIconName(iconName)) {
    throw new Error(`Icon name "${iconName}" is not a valid lucide icon name`);
  }

  const componentName = lucideIconMap[iconName];
  if (!componentName) {
    throw new Error(
      `Lucide icon "${iconName}" is not found in the lucide icon map`
    );
  }

  const iconComponent = iconComponents[componentName];
  if (!iconComponent) {
    throw new Error(
      `Failed to load lucide icon component "${componentName}" for "${iconName}". Add it to the iconComponents map in packages/ui/src/lib/icons.ts`
    );
  }

  return iconComponent;
}
