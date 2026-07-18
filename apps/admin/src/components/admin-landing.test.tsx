import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./logout-button', () => ({
  LogoutButton: () => <button type="button">Sign out</button>,
}));

import { AdminLanding } from './admin-landing';

describe('authenticated admin landing page', () => {
  it('shows the required environment text and safe staff details', () => {
    const html = renderToStaticMarkup(
      <AdminLanding
        user={{
          createdAt: '2026-07-18T00:00:00.000Z',
          email: 'staff@example.com',
          firstName: 'Staff',
          id: 'staff-id',
          lastLoginAt: '2026-07-18T00:00:00.000Z',
          lastName: 'Member',
          status: 'ACTIVE',
          updatedAt: '2026-07-18T00:00:00.000Z',
        }}
      />,
    );

    expect(html).toContain('Mensah Rentals Admin');
    expect(html).toContain('Authenticated Development Environment');
    expect(html).toContain('Staff Member');
    expect(html).toContain('staff@example.com');
    expect(html).not.toContain('passwordHash');
  });
});
