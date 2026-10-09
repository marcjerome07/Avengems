// MOCK SERVICE — replace the body of these functions with real API calls when the backend is ready.
//
// Suggested endpoint: GET /api/team

import { team } from '../data/team';
import { delay, clone } from './mockDb';

export const TEAM_ROLES = ['Team Leader', 'Scrum Master', 'Member', 'Administrator'];

export function formatMemberName(m) {
  return `${m.lastName}, ${m.firstName} ${m.middleInitial}`;
}

export function memberInitials(m) {
  return `${m.firstName[0]}${m.lastName[0]}`.toUpperCase();
}

export async function getTeamMembers() {
  await delay(250, 500);
  return clone(team);
}
