import { TeamData } from '../types/team';

export const DEFAULT_TEAM_DATA: TeamData = {
  members: [
    {
      id: 'owner',
      name: 'Owner (you)',
      role: 'admin',
      permissions: ['orders', 'menu', 'analytics', 'payouts'],
      isOwner: true,
    },
    {
      id: 'maria',
      name: 'Maria',
      role: 'staff',
      permissions: ['orders'],
    },
    {
      id: 'james',
      name: 'James',
      role: 'staff',
      permissions: ['orders', 'menu'],
    },
  ],
  pendingInvites: [
    {
      id: 'invite-sarah',
      email: 'sarah@restaurant.com',
      role: 'manager',
      permissions: ['orders', 'menu', 'analytics'],
    },
  ],
};
