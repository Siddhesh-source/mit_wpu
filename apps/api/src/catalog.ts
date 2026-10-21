import type { FieldDef, Role } from '@plc/shared';

/** Request catalogue for v1. Steps with the same stepNo run in parallel. affectedBy = fields that send the step back on amendment. */
export const CATALOG: {
  code: string;
  name: string;
  fields: FieldDef[];
  /** slaHours: deadline for the step (default 48). */
  steps: { stepNo: number; role: Role; affectedBy: string[]; slaHours?: number }[];
}[] = [
  {
    code: 'event_permission',
    name: 'Event permission',
    fields: [
      { key: 'title', label: 'Event name', type: 'text', required: true },
      { key: 'date', label: 'Event date', type: 'date', required: true },
      { key: 'venue', label: 'Venue', type: 'text', required: true },
      { key: 'headcount', label: 'Expected students', type: 'number', required: true },
      { key: 'purpose', label: 'Purpose', type: 'textarea', required: false },
    ],
    steps: [
      { stepNo: 1, role: 'faculty_coordinator', affectedBy: ['title', 'date', 'venue', 'headcount', 'purpose', 'attachments'] },
      { stepNo: 2, role: 'hod', affectedBy: ['title', 'date', 'venue', 'headcount'] },
      { stepNo: 2, role: 'security', affectedBy: ['headcount'] },
      { stepNo: 3, role: 'dean_sa', affectedBy: ['title', 'headcount'] },
    ],
  },
  {
    code: 'on_duty',
    name: 'On-duty',
    fields: [
      { key: 'title', label: 'Reason', type: 'text', required: true },
      { key: 'date', label: 'Date', type: 'date', required: true },
      { key: 'purpose', label: 'Details', type: 'textarea', required: false },
    ],
    steps: [
      { stepNo: 1, role: 'faculty_coordinator', affectedBy: ['title', 'date', 'purpose', 'attachments'] },
      { stepNo: 2, role: 'hod', affectedBy: ['title', 'date'] },
    ],
  },
  {
    code: 'bonafide',
    name: 'Bonafide certificate',
    fields: [
      { key: 'title', label: 'Needed for', type: 'text', required: true },
      { key: 'addressed_to', label: 'Addressed to', type: 'text', required: false },
    ],
    steps: [
      { stepNo: 1, role: 'hod', affectedBy: ['title', 'addressed_to', 'attachments'] },
      { stepNo: 2, role: 'dean_sa', affectedBy: ['title', 'addressed_to'] },
    ],
  },
  {
    code: 'no_dues',
    name: 'No-dues clearance',
    fields: [
      { key: 'title', label: 'Needed for', type: 'text', required: true },
      { key: 'purpose', label: 'Details', type: 'textarea', required: false },
    ],
    // Library, labs, hostel and accounts clear in parallel, then the HoD signs off.
    steps: [
      { stepNo: 1, role: 'librarian', affectedBy: ['title', 'attachments'], slaHours: 24 },
      { stepNo: 1, role: 'lab_incharge', affectedBy: ['title', 'attachments'], slaHours: 24 },
      { stepNo: 1, role: 'warden', affectedBy: ['title', 'attachments'], slaHours: 24 },
      { stepNo: 1, role: 'accounts', affectedBy: ['title', 'attachments'], slaHours: 24 },
      { stepNo: 2, role: 'hod', affectedBy: ['title', 'purpose', 'attachments'] },
    ],
  },
];
