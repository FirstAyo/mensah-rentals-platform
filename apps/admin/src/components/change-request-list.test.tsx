import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { useQuery } = vi.hoisted(() => ({ useQuery: vi.fn() }));
vi.mock('@tanstack/react-query', () => ({ useQuery }));

import { ChangeRequestList } from './change-request-list';

describe('ChangeRequestList states', () => {
  beforeEach(() => useQuery.mockReset());

  it('renders its loading state', () => {
    useQuery.mockReturnValue({ isLoading: true });
    expect(renderToStaticMarkup(<ChangeRequestList />)).toContain(
      'Loading change requests',
    );
  });

  it('renders a controlled query failure', () => {
    useQuery.mockReturnValue({ isError: true, isLoading: false });
    const html = renderToStaticMarkup(<ChangeRequestList />);
    expect(html).toContain('role="alert"');
    expect(html).toContain('could not be loaded');
  });

  it('renders the empty state after a successful query', () => {
    useQuery.mockReturnValue({ data: [], isError: false, isLoading: false });
    expect(renderToStaticMarkup(<ChangeRequestList />)).toContain(
      'No formal change requests',
    );
  });

  it('renders returned change-request data', () => {
    useQuery.mockReturnValue({
      data: [
        {
          createdAt: '2026-08-08T00:00:00.000Z',
          id: 'change-request-id',
          reason: 'Add two chairs',
          referenceNumber: 'MR-1001',
          source: 'ACCEPTED_QUOTE',
          status: 'SUBMITTED',
        },
      ],
      isError: false,
      isLoading: false,
    });
    const html = renderToStaticMarkup(<ChangeRequestList />);
    expect(html).toContain('MR-1001');
    expect(html).toContain('/change-requests/change-request-id');
  });
});
