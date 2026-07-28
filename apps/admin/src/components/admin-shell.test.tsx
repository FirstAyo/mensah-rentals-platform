import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@mensah-rentals/ui', () => ({
  ThemeToggle: () => <button type="button">Theme</button>,
}));
vi.mock('./logout-button', () => ({
  LogoutButton: () => <button type="button">Sign out</button>,
}));
vi.mock('@/lib/work-summary', () => ({
  useWorkSummary: () => ({
    data: {
      generatedAt: '2026-07-27T00:00:00.000Z',
      rentalRequests: { submittedAwaitingReview: 7, underReview: 2 },
      reservations: {
        awaitingReservation: 3,
        fullyReserved: 1,
        partiallyReserved: 2,
        unresolvedShortfallQuantity: 4,
        upcomingReservations: 3,
      },
    },
    error: null,
    loading: false,
    refresh: vi.fn(),
  }),
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
    const authorized = render(['rental_request.view']);
    expect(authorized).toContain('href="/rental-requests"');
    expect(authorized).toContain('7 submitted rental requests awaiting review');
    expect(render([])).not.toContain('href="/rental-requests"');
  });

  it('shows rental orders only to staff with order.view', () => {
    expect(render(['order.view'])).toContain('href="/orders"');
    expect(render(['order.view'])).not.toContain(
      'rental orders require reservation work',
    );
    expect(render(['order.view', 'inventory.reservation.view'])).toContain(
      '5 rental orders require reservation work',
    );
    expect(render([])).not.toContain('href="/orders"');
  });
});
