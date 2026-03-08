import type {
  DraggableAttributes,
  DraggableSyntheticListeners,
} from "@dnd-kit/core";
import { cn } from "@litgit/ui/lib/utils";
import { GroupContextMenu } from "@/components/tabs/group-context-menu";
import type { TabGroup } from "@/components/tabs/types/tab-types";
import { useTabStore } from "@/stores/tabs/use-tab-store";

interface GroupHeaderProps {
  attributes?: DraggableAttributes;
  group: TabGroup;
  listeners?: DraggableSyntheticListeners;
}

export function GroupHeader({
  group,
  attributes,
  listeners,
}: GroupHeaderProps) {
  const setEditingGroupId = useTabStore((state) => state.setEditingGroupId);
  const toggleGroupCollapse = useTabStore((state) => state.toggleGroupCollapse);

  const displayName =
    group.name.length > 50 ? `${group.name.substring(0, 50)}...` : group.name;

  return (
    <GroupContextMenu groupId={group.id}>
      <button
        aria-expanded={!group.collapsed}
        aria-haspopup="menu"
        aria-label={`Tab group ${group.name}`}
        className={cn(
          "z-10 flex h-8 max-w-36 cursor-grab items-center gap-1.5 rounded-md px-2 font-medium text-white text-xs transition-all hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 active:cursor-grabbing"
        )}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          toggleGroupCollapse(group.id);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setEditingGroupId(group.id);
        }}
        onKeyDown={(e) => {
          if (e.shiftKey && e.key === "F10") {
            e.preventDefault();
            e.stopPropagation();
            setEditingGroupId(group.id);
            return;
          }

          if (e.key === "ContextMenu") {
            e.preventDefault();
            e.stopPropagation();
            setEditingGroupId(group.id);
            return;
          }

          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            e.stopPropagation();
            toggleGroupCollapse(group.id);
          }
        }}
        onPointerDown={(e) => {
          e.stopPropagation();
        }}
        {...attributes}
        {...listeners}
        style={{
          backgroundColor: group.color,
        }}
        type="button"
      >
        <span className="truncate" title={group.name}>
          {displayName}
        </span>
      </button>
    </GroupContextMenu>
  );
}
