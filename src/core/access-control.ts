// Fine-grained access control as a pure data model: a host product declares
// its permission strings ("resource:action"), maps roles to permission sets,
// and gets back one policy engine used identically by Worker routes, agent
// actions, and React capability checks. Everything here is deny-by-default —
// unknown permissions, unknown roles, and missing context all resolve to
// "not allowed" — and nothing here touches a Request, a database, or React.

/** A capability string, conventionally "resource:action" (e.g. "task:create"). */
export type Permission = string;

/** A role name (e.g. "owner", "admin", "member"). Hosts define the set. */
export type Role = string;

/** A stored per-member override row: an explicit grant or an explicit deny. */
export type PermissionGrant = {
  effect: "deny" | "grant";
  permission: Permission;
};

/** Optional UI copy for a single permission. */
export type PermissionMeta = {
  description?: string;
  label?: string;
};

/** A named cluster of permissions for editor/UI grouping. */
export type PermissionGroup = {
  id: string;
  label: string;
  permissions: readonly Permission[];
};

export type AccessControlDefinition = {
  /** UI grouping; permissions left out of every group land in a synthesized "other" group. */
  groups?: readonly PermissionGroup[];
  /** The role that owns the resource scope (last-owner protection, delegation ceilings). */
  ownerRole?: Role;
  /** Optional per-permission label/description copy for editors. */
  permissionMeta?: Readonly<Record<Permission, PermissionMeta>>;
  /** The complete registry. Anything outside this list is ignored everywhere. */
  permissions: readonly Permission[];
  /** Role -> base permission set. Declare roles from least to most privileged. */
  roles: Readonly<Record<Role, readonly Permission[]>>;
};

export type AccessControlModel = {
  groups: readonly PermissionGroup[];
  ownerRole: Role | null;
  permissionMeta: Readonly<Record<Permission, PermissionMeta>>;
  permissions: ReadonlySet<Permission>;
  /** Declaration order of `roles`, least privileged first. */
  roleOrder: readonly Role[];
  roles: ReadonlyMap<Role, ReadonlySet<Permission>>;
};

export type EffectivePermissionInput = {
  /** Explicit per-member denies. Denies always win. */
  denies?: readonly Permission[];
  /** Explicit per-member grants on top of the role set. */
  grants?: readonly Permission[];
  role: Role;
};

export type AuthorizeOptions = {
  /** Who is asking. Required for self-scoped permissions to pass. */
  actingUserId?: string;
  /** Who owns the resource being touched. */
  resourceOwnerId?: string;
  /**
   * Permissions that only apply to the caller's own resources (e.g.
   * "comment:edit" on your own comment). When `permission` is listed here,
   * authorization additionally requires resourceOwnerId === actingUserId.
   */
  selfPermissions?: readonly Permission[];
};

export type AuthorizeResult = {
  allowed: boolean;
  reason: string;
};

/**
 * Validate a definition once at startup and freeze it into a model. Typos are
 * configuration bugs, so a role or group referencing an unregistered
 * permission throws here instead of silently never matching at runtime.
 */
export function defineAccessControl(
  definition: AccessControlDefinition
): AccessControlModel {
  const permissions = new Set<Permission>();

  for (const permission of definition.permissions) {
    if (typeof permission !== "string" || !permission.trim()) {
      throw new Error("Access-control permissions must be non-empty strings.");
    }

    if (permissions.has(permission)) {
      throw new Error(`Duplicate access-control permission: ${permission}`);
    }

    permissions.add(permission);
  }

  const roles = new Map<Role, ReadonlySet<Permission>>();

  for (const [role, rolePermissions] of Object.entries(definition.roles)) {
    for (const permission of rolePermissions) {
      if (!permissions.has(permission)) {
        throw new Error(
          `Role "${role}" references unknown permission: ${permission}`
        );
      }
    }

    roles.set(role, new Set(rolePermissions));
  }

  if (definition.ownerRole !== undefined && !roles.has(definition.ownerRole)) {
    throw new Error(`Unknown ownerRole: ${definition.ownerRole}`);
  }

  const groups = definition.groups ?? [];
  const groupIds = new Set<string>();

  for (const group of groups) {
    if (groupIds.has(group.id)) {
      throw new Error(`Duplicate permission group id: ${group.id}`);
    }

    groupIds.add(group.id);

    for (const permission of group.permissions) {
      if (!permissions.has(permission)) {
        throw new Error(
          `Group "${group.id}" references unknown permission: ${permission}`
        );
      }
    }
  }

  return {
    groups,
    ownerRole: definition.ownerRole ?? null,
    permissionMeta: definition.permissionMeta ?? {},
    permissions,
    roleOrder: [...roles.keys()],
    roles,
  };
}

/**
 * The one place effective permissions are computed:
 * (role's base set + explicit grants) - explicit denies. Denies win over
 * everything; unknown roles resolve to the empty set and unknown permission
 * strings in grants are ignored, so bad data can only narrow access.
 */
export function computeEffectivePermissions(
  model: AccessControlModel,
  { denies = [], grants = [], role }: EffectivePermissionInput
): Set<Permission> {
  const effective = new Set(model.roles.get(role) ?? []);

  for (const permission of grants) {
    if (model.permissions.has(permission)) {
      effective.add(permission);
    }
  }

  for (const permission of denies) {
    effective.delete(permission);
  }

  return effective;
}

/**
 * The policy decision every surface calls. Denies by default: no permission,
 * an empty permission string, or a self-scoped permission without a matching
 * acting user all fail with a reason string suitable for a 403 body.
 */
export function authorize(
  effective: ReadonlySet<Permission>,
  permission: Permission,
  { actingUserId, resourceOwnerId, selfPermissions }: AuthorizeOptions = {}
): AuthorizeResult {
  if (typeof permission !== "string" || !permission.trim()) {
    return { allowed: false, reason: "No permission specified" };
  }

  if (!effective.has(permission)) {
    return { allowed: false, reason: `Missing permission: ${permission}` };
  }

  if (selfPermissions?.includes(permission)) {
    if (!actingUserId || !resourceOwnerId) {
      return {
        allowed: false,
        reason: `Permission ${permission} is limited to your own resources`,
      };
    }

    if (actingUserId !== resourceOwnerId) {
      return {
        allowed: false,
        reason: `Permission ${permission} is limited to your own resources`,
      };
    }
  }

  return { allowed: true, reason: "Allowed" };
}

/** Boolean convenience over `authorize` for UI show/hide checks. */
export function can(
  effective: ReadonlySet<Permission>,
  permission: Permission,
  opts?: AuthorizeOptions
): boolean {
  return authorize(effective, permission, opts).allowed;
}

/**
 * Role-rank comparison using declaration order (least privileged first).
 * Unknown roles never satisfy any minimum — deny-by-default.
 */
export function roleAtLeast(
  model: AccessControlModel,
  role: Role,
  minimum: Role
): boolean {
  const roleIndex = model.roleOrder.indexOf(role);
  const minimumIndex = model.roleOrder.indexOf(minimum);

  if (roleIndex === -1 || minimumIndex === -1) {
    return false;
  }

  return roleIndex >= minimumIndex;
}

/** True when `value` is a registered permission of this model. */
export function isPermission(
  model: AccessControlModel,
  value: unknown
): value is Permission {
  return typeof value === "string" && model.permissions.has(value);
}

/** Every registered permission, in registry declaration order. */
export function listPermissions(model: AccessControlModel): Permission[] {
  return [...model.permissions];
}

/**
 * Declared groups plus a synthesized trailing group for any registered
 * permissions no group claims, so editors always cover the whole registry.
 */
export function listPermissionGroups(
  model: AccessControlModel
): PermissionGroup[] {
  const grouped = new Set<Permission>();

  for (const group of model.groups) {
    for (const permission of group.permissions) {
      grouped.add(permission);
    }
  }

  const ungrouped = [...model.permissions].filter(
    (permission) => !grouped.has(permission)
  );

  const groups = [...model.groups];

  if (ungrouped.length > 0) {
    groups.push({
      id: "other",
      label: "Other",
      permissions: ungrouped,
    });
  }

  return groups;
}

/**
 * Split stored override rows into the grants/denies arrays
 * `computeEffectivePermissions` expects. A permission that appears as both
 * lands in both lists, and the deny wins downstream.
 */
export function partitionPermissionGrants(
  rows: readonly PermissionGrant[]
): { denies: Permission[]; grants: Permission[] } {
  const denies: Permission[] = [];
  const grants: Permission[] = [];

  for (const row of rows) {
    if (row.effect === "deny") {
      denies.push(row.permission);
    } else if (row.effect === "grant") {
      grants.push(row.permission);
    }
  }

  return { denies, grants };
}
