export const ROLES = ['student', 'faculty_coordinator', 'hod', 'dean_sa', 'security', 'admin'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = {
  student: 'Student',
  faculty_coordinator: 'Faculty coordinator',
  hod: 'HoD',
  dean_sa: 'Dean Student Affairs',
  security: 'Security',
  admin: 'Admin',
};

export const APPROVER_ROLES: Role[] = ['faculty_coordinator', 'hod', 'dean_sa', 'security'];

export interface Profile {
  id: string;
  name: string;
  title: string;
  role: Role;
  initials: string;
}

export interface Me extends Omit<Profile, 'role'> {
  roles: Role[];
  department: string;
}

/** Home route for a user, by their primary role. */
export function homeFor(roles: Role[]): string {
  if (roles.includes('student')) return '/student';
  if (roles.includes('security')) return '/gate';
  if (roles.includes('admin')) return '/admin';
  return '/inbox';
}
