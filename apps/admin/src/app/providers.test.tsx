import { useQuery } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { Providers } from './providers';

function QueryConsumer() {
  const result = useQuery({
    enabled: false,
    queryFn: async () => 'ready',
    queryKey: ['provider-smoke'],
  });
  return <span>{result.fetchStatus}</span>;
}

describe('admin application providers', () => {
  it('provides one application-level QueryClient context', () => {
    expect(() =>
      renderToStaticMarkup(
        <Providers>
          <QueryConsumer />
        </Providers>,
      ),
    ).not.toThrow();
  });
});
