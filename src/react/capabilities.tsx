// Headless React bindings for the core access-control model. The provider
// holds the caller's effective permission set (computed server-side and
// shipped with the session); `useCan` answers show/hide/disable questions
// with the same `authorize` the Worker uses, so UI affordances and API
// enforcement can never drift. `usePermissionEditor` is pure state for a
// grant/deny override editor — no StyleX, no components, just grouped rows.

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  authorize,
  computeEffectivePermissions,
  listPermissionGroups,
  type AccessControlModel,
  type AuthorizeOptions,
  type Permission,
} from "../core/access-control.js";

const EMPTY_CAPABILITIES: ReadonlySet<Permission> = new Set();

// Default is the empty set, not undefined: a component rendered outside the
// provider sees no capabilities and hides everything — deny-by-default.
const CapabilityContext =
  createContext<ReadonlySet<Permission>>(EMPTY_CAPABILITIES);

export type CapabilityProviderProps = {
  children: ReactNode;
  /** The caller's effective permissions, as computed by the server. */
  permissions: Iterable<Permission>;
};

export function CapabilityProvider({
  children,
  permissions,
}: CapabilityProviderProps) {
  const effective = useMemo<ReadonlySet<Permission>>(
    () => new Set(permissions),
    [permissions]
  );

  return (
    <CapabilityContext.Provider value={effective}>
      {children}
    </CapabilityContext.Provider>
  );
}

/** The caller's effective permission set (empty outside the provider). */
export function useCapabilities(): ReadonlySet<Permission> {
  return useContext(CapabilityContext);
}

/** Boolean capability check with the same semantics as the Worker's guard. */
export function useCan(permission: Permission, opts?: AuthorizeOptions): boolean {
  const effective = useCapabilities();

  return authorize(effective, permission, opts).allowed;
}

// --- Headless permission editor -------------------------------------------

/** inherited = follows the role; granted/denied = explicit member override. */
export type PermissionOverrideState = "denied" | "granted" | "inherited";

export type PermissionEditorRow = {
  /** Whether the permission is effectively allowed with current edits. */
  allowed: boolean;
  description?: string;
  /** Whether the base role includes this permission. */
  inheritedFromRole: boolean;
  label: string;
  permission: Permission;
  setState: (state: PermissionOverrideState) => void;
  state: PermissionOverrideState;
};

export type PermissionEditorGroup = {
  id: string;
  label: string;
  rows: PermissionEditorRow[];
};

export type PermissionEditorOptions = {
  /**
   * The editor's own effective permissions. When provided, permissions the
   * editor does not hold are omitted entirely — you cannot see, grant, or
   * deny a capability you cannot delegate.
   */
  delegatableBy?: Iterable<Permission>;
  denies?: readonly Permission[];
  grants?: readonly Permission[];
  role: string;
};

export type PermissionEditor = {
  /** Current explicit denies, ready to persist. */
  denies: Permission[];
  /** Effective set under the current edits. */
  effective: ReadonlySet<Permission>;
  /** Current explicit grants, ready to persist. */
  grants: Permission[];
  groups: PermissionEditorGroup[];
  isDirty: boolean;
  reset: () => void;
  setState: (permission: Permission, state: PermissionOverrideState) => void;
};

/**
 * Override-editor state for one member: grouped rows, each inherited,
 * granted, or denied, plus the grants/denies arrays to persist. Initial
 * overrides are captured on mount; re-key the owning component (e.g. by
 * member id) to load a different member.
 */
export function usePermissionEditor(
  model: AccessControlModel,
  { delegatableBy, denies = [], grants = [], role }: PermissionEditorOptions
): PermissionEditor {
  // Initial overrides are captured lazily on mount; edits live in
  // `overrides`, and `reset` returns to this snapshot.
  const [initialOverrides] = useState(() =>
    buildOverrides(model, grants, denies)
  );
  const [overrides, setOverrides] = useState(initialOverrides);

  const delegatable = useMemo(
    () => (delegatableBy ? new Set(delegatableBy) : null),
    [delegatableBy]
  );

  const setState = useCallback(
    (permission: Permission, state: PermissionOverrideState) => {
      if (!model.permissions.has(permission)) {
        return;
      }

      if (delegatable && !delegatable.has(permission)) {
        return;
      }

      setOverrides((current) => {
        const next = new Map(current);

        if (state === "inherited") {
          next.delete(permission);
        } else {
          next.set(permission, state);
        }

        return next;
      });
    },
    [delegatable, model]
  );

  const reset = useCallback(() => {
    setOverrides(initialOverrides);
  }, [initialOverrides]);

  return useMemo(() => {
    const currentGrants: Permission[] = [];
    const currentDenies: Permission[] = [];

    for (const [permission, state] of overrides) {
      if (state === "granted") {
        currentGrants.push(permission);
      } else {
        currentDenies.push(permission);
      }
    }

    const effective = computeEffectivePermissions(model, {
      denies: currentDenies,
      grants: currentGrants,
      role,
    });
    const rolePermissions = model.roles.get(role) ?? new Set<Permission>();

    const groups: PermissionEditorGroup[] = [];

    for (const group of listPermissionGroups(model)) {
      const rows: PermissionEditorRow[] = [];

      for (const permission of group.permissions) {
        if (delegatable && !delegatable.has(permission)) {
          continue;
        }

        const meta = model.permissionMeta[permission];

        rows.push({
          allowed: effective.has(permission),
          description: meta?.description,
          inheritedFromRole: rolePermissions.has(permission),
          label: meta?.label ?? permission,
          permission,
          setState: (state) => setState(permission, state),
          state: overrides.get(permission) ?? "inherited",
        });
      }

      if (rows.length > 0) {
        groups.push({ id: group.id, label: group.label, rows });
      }
    }

    return {
      denies: currentDenies,
      effective,
      grants: currentGrants,
      groups,
      isDirty: !sameOverrides(overrides, initialOverrides),
      reset,
      setState,
    };
  }, [delegatable, initialOverrides, model, overrides, reset, role, setState]);
}

function buildOverrides(
  model: AccessControlModel,
  grants: readonly Permission[],
  denies: readonly Permission[]
): Map<Permission, "denied" | "granted"> {
  const overrides = new Map<Permission, "denied" | "granted">();

  for (const permission of grants) {
    if (model.permissions.has(permission)) {
      overrides.set(permission, "granted");
    }
  }

  // Denies second so a permission stored as both resolves to denied.
  for (const permission of denies) {
    if (model.permissions.has(permission)) {
      overrides.set(permission, "denied");
    }
  }

  return overrides;
}

function sameOverrides(
  a: ReadonlyMap<Permission, "denied" | "granted">,
  b: ReadonlyMap<Permission, "denied" | "granted">
): boolean {
  if (a.size !== b.size) {
    return false;
  }

  for (const [permission, state] of a) {
    if (b.get(permission) !== state) {
      return false;
    }
  }

  return true;
}
