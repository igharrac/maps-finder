'use client';

import { useActionState } from 'react';
import { signIn } from './actions';

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(signIn, undefined);

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-2">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11Z" />
            <circle cx="12" cy="10" r="2.5" />
          </svg>
          <span className="font-display text-2xl">Maps Finder</span>
        </div>

        <form action={formAction} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-ink-3">E-mailadres</span>
            <input
              type="email"
              name="email"
              autoComplete="email"
              required
              className="h-11 rounded-lg border border-line bg-surface px-3 text-sm"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-ink-3">Wachtwoord</span>
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              required
              className="h-11 rounded-lg border border-line bg-surface px-3 text-sm"
            />
          </label>

          {state?.error ? (
            <p role="alert" className="text-sm text-status-responded">
              {state.error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={pending}
            className="h-11 rounded-lg bg-accent font-semibold text-white disabled:opacity-60"
          >
            {pending ? 'Bezig…' : 'Inloggen'}
          </button>
        </form>

        <p className="mt-6 text-xs leading-relaxed text-ink-3">
          Maak je account eenmalig aan in het Supabase-dashboard onder Authentication → Users.
          Er is bewust geen openbare registratie.
        </p>
      </div>
    </main>
  );
}
