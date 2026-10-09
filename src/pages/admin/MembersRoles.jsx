import { useState } from 'react';
import AdminHeader from '../../components/admin/AdminHeader';
import Badge, { StatusBadge } from '../../components/ui/Badge';
import Skeleton from '../../components/ui/Skeleton';
import { useToast } from '../../context/ToastContext';
import useServiceData from '../../hooks/useServiceData';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import { getTeamMembers, formatMemberName, memberInitials, TEAM_ROLES } from '../../services/teamService';
import { stoneTheme } from '../../utils/stoneTheme';

const GROUPS = [
  { title: 'Team Leader', match: (r) => r === 'Team Leader' },
  { title: 'Scrum Master', match: (r) => r === 'Scrum Master' },
  { title: 'Members', match: (r) => r === 'Member' || r === 'Administrator' },
];

const ROLE_BADGE = { 'Team Leader': 'new', 'Scrum Master': 'bronze', Member: 'neutral', Administrator: 'info' };

function MemberCard({ member, role, onRoleChange }) {
  const selectId = `role-${member.id}`;
  return (
    <li className="member-card">
      <span className="member-avatar" style={{ '--ring': stoneTheme(member.accent).base }} aria-hidden="true">
        {memberInitials(member)}
      </span>
      <h3 className="member-card__name">{formatMemberName(member)}</h3>
      <div className="member-card__meta">
        <Badge variant={ROLE_BADGE[role]}>{role}</Badge>
        <StatusBadge status={member.status} />
      </div>
      <label className="visually-hidden" htmlFor={selectId}>
        Role for {formatMemberName(member)}
      </label>
      <select
        id={selectId}
        className="status-select"
        style={{ marginTop: 12 }}
        value={role}
        onChange={(e) => onRoleChange(member, e.target.value)}
      >
        {TEAM_ROLES.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
    </li>
  );
}

export default function MembersRoles() {
  useDocumentTitle('Admin · Members & Roles');
  const { showToast } = useToast();
  const { data: members, loading } = useServiceData(getTeamMembers);
  // Role edits are local to this view in the prototype.
  const [roles, setRoles] = useState({});
  const roleOf = (m) => roles[m.id] ?? m.role;

  function handleRoleChange(member, role) {
    setRoles((r) => ({ ...r, [member.id]: role }));
    showToast(`${member.firstName} ${member.lastName} is now ${role}. (Demo only, not saved.)`, { type: 'info' });
  }

  return (
    <>
      <AdminHeader title="Members & Roles" subtitle="The Avengems project team. Roles: Team Leader, Scrum Master, Member, Administrator." />

      {loading || !members ? (
        <div className="member-grid">
          {Array.from({ length: 7 }, (_, i) => (
            <Skeleton key={i} height={240} />
          ))}
        </div>
      ) : (
        GROUPS.map((group) => {
          const list = members.filter((m) => group.match(roleOf(m)));
          if (!list.length) return null;
          return (
            <section key={group.title} className="member-group" aria-labelledby={`g-${group.title}`}>
              <h2 id={`g-${group.title}`} className="member-group__title">
                {group.title}
              </h2>
              <ul className="member-grid" role="list">
                {list.map((m) => (
                  <MemberCard key={m.id} member={m} role={roleOf(m)} onRoleChange={handleRoleChange} />
                ))}
              </ul>
            </section>
          );
        })
      )}
    </>
  );
}
