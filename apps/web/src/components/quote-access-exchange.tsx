'use client';

import { useEffect, useState } from 'react';

export function QuoteAccessExchange() {
  const [message, setMessage] = useState('Securing your private quote…');
  useEffect(() => {
    let active = true;
    const exchange = () => {
      const parameters = new URLSearchParams(window.location.hash.slice(1));
      const capability = parameters.get('capability');
      history.replaceState(null, '', '/quote/access');
      if (!capability) {
        setMessage('This quote link is unavailable.');
        return;
      }
      setMessage('Securing your private quote…');
      void fetch('/api/quote/access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ capability }),
      })
        .then((response) => {
          if (!response.ok) throw new Error();
          if (active) window.location.replace('/quote');
        })
        .catch(() => {
          if (active) setMessage('This quote link is unavailable.');
        });
    };
    exchange();
    window.addEventListener('hashchange', exchange);
    return () => {
      active = false;
      window.removeEventListener('hashchange', exchange);
    };
  }, []);
  return (
    <p
      aria-live="polite"
      className="rounded-xl border border-border bg-card p-6"
    >
      {message}
    </p>
  );
}
