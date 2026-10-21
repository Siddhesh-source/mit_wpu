export * from './crypto';

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

// ---------- requests ----------

export type RequestStatus = 'in_review' | 'approved' | 'rejected' | 'returned';
export type Decision = 'waiting' | 'pending' | 'approved' | 'rejected' | 'returned' | 'cancelled' | 'carried';

export const STATUS_LABEL: Record<RequestStatus, string> = {
  in_review: 'In review',
  approved: 'Approved',
  rejected: 'Rejected',
  returned: 'Returned',
};

export interface FieldDef {
  key: string;
  label: string;
  type: 'text' | 'date' | 'number' | 'textarea';
  required: boolean;
}

export interface RequestType {
  code: string;
  name: string;
  fields: FieldDef[];
  chain: { stepNo: number; role: Role }[];
}

export interface TimelineStep {
  approvalId: number;
  stepNo: number;
  role: Role;
  roleLabel: string;
  assignee: { id: string; name: string };
  decision: Decision;
  comment: string | null;
  openedAt: string | null;
  signedAt: string | null;
  version: number;
}

export interface RequestSummary {
  id: string;
  type: string;
  typeName: string;
  title: string;
  status: RequestStatus;
  version: number;
  student: { id: string; name: string; title: string };
  department: string;
  createdAt: string;
  updatedAt: string;
  /** Who has it right now, and since when (pending approvals only). */
  withNow: { role: Role; roleLabel: string; name: string; since: string }[];
}

export interface RequestDetail extends RequestSummary {
  form: Record<string, string | number>;
  fields: FieldDef[];
  timeline: TimelineStep[];
  lastComment: { role: Role; decision: Decision; comment: string } | null;
}

export interface InboxItem extends RequestDetail {
  approvalId: number;
  myRole: Role;
}
