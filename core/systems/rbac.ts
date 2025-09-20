import { User, UserRole } from '../types/index.ts';

/**
 * The RBAC (Role-Based Access Control) system is responsible for
 * determining if a user has permission to perform a specific action.
 */

// Define the actions that can be performed
export type Action = 
  | 'create'
  | 'read'
  | 'update'
  | 'delete'
  | 'manage'; // A special permission for full control

// Define the resources that can be acted upon
export type Resource = 
  | 'template'
  | 'project'
  | 'brandKit'
  | 'user'
  | 'billing'
  | 'systemSettings';

// A map defining which roles have which permissions on which resources.
const permissions: Record<UserRole, Partial<Record<Resource, Action[]>>> = {
  [UserRole.CUSTOMER]: {
    project: ['create', 'read', 'update', 'delete'],
    brandKit: ['create', 'read', 'update', 'delete'],
    billing: ['read', 'update'],
  },
  [UserRole.DESIGNER]: {
    template: ['create', 'read', 'update'],
  },
  [UserRole.ADMIN]: {
    systemSettings: ['manage'],
    user: ['manage'],
    template: ['manage'],
  },
};

/**
 * Checks if a user has permission to perform an action on a resource.
 * 
 * @param user The user object.
 * @param action The action being attempted.
 * @param resource The resource being acted upon.
 * @returns A boolean indicating if the action is allowed.
 */
export const can = (user: User | null, action: Action, resource: Resource): boolean => {
  if (!user) return false;
  
  // Admins can do anything
  if (user.role === UserRole.ADMIN) return true;

  const rolePermissions = permissions[user.role];
  if (!rolePermissions) return false;

  const resourcePermissions = rolePermissions[resource];
  if (!resourcePermissions) return false;
  
  // Check if the role has the specific action or the 'manage' action
  return resourcePermissions.includes(action) || resourcePermissions.includes('manage');
};
