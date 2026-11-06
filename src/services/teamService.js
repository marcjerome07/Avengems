// Static academic project-team information; these labels do not grant application access.

import { team } from '../data/team';

export const TEAM_ROLES = ['Team Leader', 'Scrum Master', 'Member', 'Administrator'];

export function formatMemberName(m) {
  return `${m.lastName}, ${m.firstName} ${m.middleInitial}`;
}

export function memberInitials(m) {
  return `${m.firstName[0]}${m.lastName[0]}`.toUpperCase();
}

export async function getTeamMembers() {
  return structuredClone(team);
}
