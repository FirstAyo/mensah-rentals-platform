import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@mensah-rentals/ui', () => ({
  ThemeToggle: () => <button type="button">Theme</button>,
}));
vi.mock('./logout-button', () => ({
  LogoutButton: () => <button type="button">Sign out</button>,
}));

import { AdminShell } from './admin-shell';

function render(permissionKeys: string[]) {
  return renderToStaticMarkup(
    <AdminShell
      user={{
        createdAt: '2026-07-27T00:00:00.000Z',
        email: 'staff@example.com',
        firstName: 'Staff',
        id: 'staff-id',
        lastLoginAt: null,
        lastName: 'Member',
        permissionKeys,
        roles: [],
        status: 'ACTIVE',
        updatedAt: '2026-07-27T00:00:00.000Z',
      }}
    >
      <p>Protected content</p>
    </AdminShell>,
  );
}

describe('permission-aware admin shell', () => {
  it('shows rental requests only to a staff user with view permission', () => {
    expect(render(['rental_request.view'])).toContain(
      'href="/rental-requests"',
    );
    expect(render([])).not.toContain('href="/rental-requests"');
  });
});
