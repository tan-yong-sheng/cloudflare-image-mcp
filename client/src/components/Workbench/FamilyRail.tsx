import type { AdminKey, AdminProvider } from "../../api/types";
import { FamilyMark } from "./FamilyMark";

interface FamilyRailProps {
  providers: AdminProvider[];
  keys: AdminKey[];
  selected: string;
  /** Whether the health payload is still in flight. */
  loading: boolean;
  onSelect: (providerId: string) => void;
}

/**
 * The provider family rail.
 *
 * Each family shows how many of its keys are active, so the operator
 * can see the pool's shape before opening a family.
 */
export function FamilyRail({
  providers,
  keys,
  selected,
  loading,
  onSelect,
}: FamilyRailProps) {
  if (loading && providers.length === 0) {
    return (
      <div id="adminRail" className="space-y-1">
        <p className="text-xs opacity-60">Loading providers…</p>
      </div>
    );
  }
  return (
    <div id="adminRail" className="space-y-1">
      {providers.map((provider) => {
        const active = provider.id === selected;
        const familyKeys = keys.filter((key) => key.providerId === provider.id);
        const enabled = familyKeys.filter((key) => key.enabled).length;
        return (
          <button
            key={provider.id}
            type="button"
            className="w-full text-left p-2 rounded border"
            style={{
              borderColor: active ? "var(--primary)" : "transparent",
              backgroundColor: active ? "rgba(80,70,229,.08)" : "",
            }}
            aria-pressed={active}
            onClick={() => onSelect(provider.id)}
          >
            <div className="flex items-center text-sm font-medium">
              <FamilyMark providerId={provider.id} />
              {provider.displayName || provider.id}
            </div>
            <div className="text-xs opacity-60 mt-1">
              {enabled}/{familyKeys.length} active
            </div>
          </button>
        );
      })}
    </div>
  );
}
