'use client';

import { LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function LogoutButton() {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);

  async function logout() {
    setIsPending(true);
    try {
      await fetch('/api/auth/logout', {
        body: '{}',
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      });
    } finally {
      router.replace('/login');
      router.refresh();
    }
  }

  return (
    <button
      className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white disabled:cursor-wait disabled:opacity-60"
      disabled={isPending}
      onClick={logout}
      type="button"
    >
      <LogOut aria-hidden="true" size={16} />
      {isPending ? 'Signing out…' : 'Sign out'}
    </button>
  );
}
