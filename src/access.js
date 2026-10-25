// Roles are independent personas, not an implicit privilege hierarchy.
const grants = new Map([
  ['guest', []],
  ['student', ['account:read', 'workspace:student', 'verification:own', 'listings:own', 'reviews:create']],
  ['representative', ['account:read', 'workspace:representative', 'verification:own', 'listings:own']],
  ['admin', ['account:read', 'workspace:admin', 'verification:review', 'listings:review']],
]);

export function permissionsFor(user) {
  return [...(grants.get(user?.role ?? 'guest') ?? [])];
}

export function requirePermission(user, permission) {
  if (!user) {
    throw Object.assign(new Error('Sign in to continue.'), { status: 401 });
  }
  // Missing policies, unknown permissions and unknown roles all deny access.
  if (!permission || !permissionsFor(user).includes(permission)) {
    throw Object.assign(new Error('You do not have permission to access this resource.'), { status: 403 });
  }
}
