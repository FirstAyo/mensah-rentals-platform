'use client';

import type {
  AdminFeatureSettingsResponse,
  FeatureTransitionPreviewResponse,
  PlatformFeatureKey,
  PlatformFeaturePreset,
  PlatformFeatureState,
} from '@mensah-rentals/types';
import {
  CheckCircle2,
  FlaskConical,
  LoaderCircle,
  PowerOff,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';

import { AccessibleDialog } from './accessible-dialog';

const stateDetails = {
  DISABLED: {
    icon: PowerOff,
    label: 'Disabled',
    className: 'bg-muted text-muted-foreground',
  },
  ENABLED: {
    icon: CheckCircle2,
    label: 'Enabled',
    className: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  },
  INTERNAL_TESTING: {
    icon: FlaskConical,
    label: 'Testing',
    className: 'bg-amber-500/20 text-foreground',
  },
} as const;

const presets: Array<{
  key: PlatformFeaturePreset;
  label: string;
  description: string;
}> = [
  {
    key: 'WEBSITE_ONLY',
    label: 'Website Only',
    description:
      'Keep the public website and catalogue while turning off operational workflows.',
  },
  {
    key: 'WEBSITE_AND_RENTAL_REQUESTS',
    label: 'Website + Rental Requests',
    description: 'Enable public rental requests without advanced operations.',
  },
  {
    key: 'STAGED_OPERATIONS_TEST',
    label: 'Staged Operations Test',
    description:
      'Place every operational module in Testing for local or staging QA.',
  },
  {
    key: 'FULL_OPERATIONS',
    label: 'Full Operations',
    description: 'Enable every supported operational module.',
  },
];

type Pending =
  | {
      kind: 'feature';
      featureKey: PlatformFeatureKey;
      operationId: string;
      state: PlatformFeatureState;
      preview: FeatureTransitionPreviewResponse;
    }
  | {
      kind: 'preset';
      operationId: string;
      preset: PlatformFeaturePreset;
      preview: FeatureTransitionPreviewResponse;
    };

export function FeatureSettingsPanel({
  canManage,
  initial,
}: {
  canManage: boolean;
  initial: AdminFeatureSettingsResponse;
}) {
  const router = useRouter();
  const [settings, setSettings] = useState(initial);
  const [pending, setPending] = useState<Pending | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const cancelRef = useRef<HTMLButtonElement>(null);

  const labels = new Map(
    settings.features.map((feature) => [feature.key, feature.label]),
  );

  async function request(path: string, body: unknown, method = 'POST') {
    const response = await fetch(`/api/feature-settings${path}`, {
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
      method,
    });
    const value: unknown = await response.json();
    if (!response.ok) {
      const record =
        value && typeof value === 'object'
          ? (value as Record<string, unknown>)
          : {};
      const message =
        typeof record.message === 'string'
          ? record.message
          : 'The feature setting could not be updated.';
      const blockers = Array.isArray(record.blockers)
        ? record.blockers.filter(
            (item): item is string => typeof item === 'string',
          )
        : [];
      throw new Error(
        blockers.length ? `${message} ${blockers.join(' ')}` : message,
      );
    }
    return value;
  }

  async function chooseFeature(
    featureKey: PlatformFeatureKey,
    state: PlatformFeatureState,
  ) {
    const current = settings.features.find(
      (feature) => feature.key === featureKey,
    );
    if (!current || current.state === state) return;
    setLoading(featureKey);
    setError('');
    try {
      const preview = (await request('/preview', {
        featureKey,
        state,
        includeDependencies: state !== 'DISABLED',
        includeDependents: state === 'DISABLED',
      })) as FeatureTransitionPreviewResponse;
      setPending({
        featureKey,
        kind: 'feature',
        operationId: crypto.randomUUID(),
        preview,
        state,
      });
      setReason('');
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Preview could not be loaded.',
      );
    } finally {
      setLoading(null);
    }
  }

  async function choosePreset(preset: PlatformFeaturePreset) {
    setLoading(`preset:${preset}`);
    setError('');
    try {
      const preview = (await request('/presets/preview', {
        preset,
      })) as FeatureTransitionPreviewResponse;
      setPending({
        kind: 'preset',
        operationId: crypto.randomUUID(),
        preset,
        preview,
      });
      setReason('');
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Preset preview could not be loaded.',
      );
    } finally {
      setLoading(null);
    }
  }

  async function apply() {
    if (!pending || pending.preview.blockers.length) return;
    if (pending.preview.requiresReason && reason.trim().length < 10) {
      setError('Enter a clear internal reason of at least 10 characters.');
      return;
    }
    setLoading('apply');
    setError('');
    const expectedVersions = Object.fromEntries(
      pending.preview.changes.map((change) => [
        change.featureKey,
        settings.features.find((feature) => feature.key === change.featureKey)
          ?.version ?? -1,
      ]),
    );
    try {
      const next =
        pending.kind === 'feature'
          ? await request(
              '',
              {
                expectedVersions,
                featureKey: pending.featureKey,
                includeDependencies: pending.state !== 'DISABLED',
                includeDependents: pending.state === 'DISABLED',
                operationId: pending.operationId,
                ...(reason.trim() ? { reason: reason.trim() } : {}),
                state: pending.state,
              },
              'PUT',
            )
          : await request('/presets', {
              expectedVersions,
              operationId: pending.operationId,
              preset: pending.preset,
              ...(reason.trim() ? { reason: reason.trim() } : {}),
            });
      setSettings(next as AdminFeatureSettingsResponse);
      setPending(null);
      setReason('');
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'The feature setting could not be updated.',
      );
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
        <div className="flex items-start gap-3">
          <SlidersHorizontal
            aria-hidden="true"
            className="mt-1 h-6 w-6 text-primary"
          />
          <div>
            <h2 className="text-xl font-semibold">Rollout presets</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Preview and apply a safe group of feature states atomically.
              Existing data is never deleted.
            </p>
          </div>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {presets.map((preset) => (
            <button
              aria-busy={loading === `preset:${preset.key}`}
              className="min-h-28 rounded-xl border border-border bg-background p-4 text-left hover:border-primary focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait disabled:opacity-60"
              disabled={!canManage || loading !== null}
              key={preset.key}
              onClick={() => void choosePreset(preset.key)}
              type="button"
            >
              <span className="flex items-center gap-2 font-semibold">
                {loading === `preset:${preset.key}` ? (
                  <LoaderCircle
                    aria-hidden="true"
                    className="h-4 w-4 animate-spin motion-reduce:animate-none"
                  />
                ) : null}
                {preset.label}
              </span>
              <span className="mt-2 block text-sm leading-5 text-muted-foreground">
                {preset.description}
              </span>
            </button>
          ))}
        </div>
      </section>

      {error && !pending ? (
        <p
          className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      {!canManage ? (
        <p className="rounded-xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
          You have read-only access to feature settings. A staff member with
          feature-settings management permission must apply changes.
        </p>
      ) : null}

      <section aria-labelledby="operational-modules-title">
        <h2 className="text-2xl font-semibold" id="operational-modules-title">
          Operational modules
        </h2>
        <p className="mt-2 text-muted-foreground">
          Control which operational modules are available. Disabling a feature
          does not delete its existing data.
        </p>
        <div className="mt-5 grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          {settings.features.map((feature) => {
            const detail = stateDetails[feature.state];
            const Icon = detail.icon;
            return (
              <article
                className="min-w-0 rounded-2xl border border-border bg-card p-5 shadow-sm"
                key={feature.key}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-lg font-semibold">{feature.label}</h3>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      {feature.description}
                    </p>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${detail.className}`}
                  >
                    <Icon aria-hidden="true" className="h-3.5 w-3.5" />{' '}
                    {detail.label}
                  </span>
                </div>
                <label className="mt-5 grid gap-2 text-sm font-medium">
                  Rollout state
                  <span className="relative">
                    <select
                      aria-busy={loading === feature.key}
                      className="h-11 w-full appearance-none rounded-lg border border-border bg-background px-3 pr-10 outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait disabled:opacity-60"
                      disabled={!canManage || loading !== null}
                      onChange={(event) =>
                        void chooseFeature(
                          feature.key,
                          event.currentTarget.value as PlatformFeatureState,
                        )
                      }
                      value={feature.state}
                    >
                      <option value="ENABLED">Enabled</option>
                      <option value="INTERNAL_TESTING">Testing</option>
                      <option value="DISABLED">Disabled</option>
                    </select>
                    {loading === feature.key ? (
                      <LoaderCircle
                        aria-hidden="true"
                        className="absolute right-3 top-3.5 h-4 w-4 animate-spin motion-reduce:animate-none"
                      />
                    ) : null}
                  </span>
                </label>
                <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="font-medium">Requires</dt>
                    <dd className="mt-1 text-muted-foreground">
                      {feature.dependencies
                        .map((key) => labels.get(key))
                        .join(', ') || 'None'}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-medium">Used by</dt>
                    <dd className="mt-1 text-muted-foreground">
                      {feature.dependents
                        .map((key) => labels.get(key))
                        .join(', ') || 'None'}
                    </dd>
                  </div>
                </dl>
                <p className="mt-4 text-xs text-muted-foreground">
                  Last changed {new Date(feature.updatedAt).toLocaleString()}
                </p>
              </article>
            );
          })}
        </div>
      </section>

      <AccessibleDialog
        descriptionId="feature-change-description"
        initialFocusRef={cancelRef}
        onClose={() => loading !== 'apply' && setPending(null)}
        open={pending !== null}
        titleId="feature-change-title"
      >
        {pending ? (
          <div aria-busy={loading === 'apply'}>
            <div className="flex items-start justify-between gap-4 border-b border-border p-5">
              <div>
                <h2 className="text-xl font-semibold" id="feature-change-title">
                  {pending.kind === 'preset'
                    ? `Apply ${presets.find((item) => item.key === pending.preset)?.label}?`
                    : `Update ${labels.get(pending.featureKey)}?`}
                </h2>
                <p
                  className="mt-2 text-sm text-muted-foreground"
                  id="feature-change-description"
                >
                  Review every change before it is saved. Existing business data
                  will not be deleted.
                </p>
              </div>
              <button
                aria-label="Close dialog"
                className="rounded-lg p-2 hover:bg-muted"
                disabled={loading === 'apply'}
                onClick={() => setPending(null)}
                type="button"
              >
                <X aria-hidden="true" className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4 p-5">
              {pending.preview.changes.length ? (
                <ul className="space-y-2">
                  {pending.preview.changes.map((change) => (
                    <li
                      className="rounded-lg border border-border bg-background p-3 text-sm"
                      key={change.featureKey}
                    >
                      <strong>{labels.get(change.featureKey)}</strong>
                      <span className="mt-1 block text-muted-foreground">
                        {stateDetails[change.from].label} →{' '}
                        {stateDetails[change.to].label}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">
                  This configuration is already active.
                </p>
              )}
              {pending.preview.blockers.length ? (
                <div
                  className="rounded-xl border border-destructive/50 bg-destructive/10 p-4"
                  role="alert"
                >
                  <h3 className="font-semibold">This change is blocked</h3>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                    {pending.preview.blockers.map((blocker) => (
                      <li key={blocker}>{blocker}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {pending.preview.requiresReason ? (
                <label className="grid gap-2 text-sm font-medium">
                  Internal reason
                  <textarea
                    className="min-h-24 rounded-lg border border-border bg-background p-3"
                    maxLength={500}
                    onChange={(event) => setReason(event.currentTarget.value)}
                    placeholder="Explain why these operational modules are being disabled."
                    value={reason}
                  />
                </label>
              ) : null}
              {error ? (
                <p className="text-sm text-destructive" role="alert">
                  {error}
                </p>
              ) : null}
            </div>
            <div className="flex flex-col-reverse gap-3 border-t border-border p-5 sm:flex-row sm:justify-end">
              <button
                className="min-h-11 rounded-lg border border-border px-5 font-medium"
                disabled={loading === 'apply'}
                onClick={() => setPending(null)}
                ref={cancelRef}
                type="button"
              >
                Cancel
              </button>
              <button
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-5 font-semibold text-primary-foreground disabled:cursor-wait disabled:opacity-60"
                disabled={
                  loading === 'apply' ||
                  pending.preview.blockers.length > 0 ||
                  pending.preview.changes.length === 0
                }
                onClick={() => void apply()}
                type="button"
              >
                {loading === 'apply' ? (
                  <>
                    <LoaderCircle
                      aria-hidden="true"
                      className="h-4 w-4 animate-spin motion-reduce:animate-none"
                    />{' '}
                    Applying…
                  </>
                ) : pending.kind === 'preset' ? (
                  'Apply preset'
                ) : pending.preview.changes.length > 1 ? (
                  `Update ${pending.preview.changes.length} features`
                ) : (
                  'Save change'
                )}
              </button>
            </div>
          </div>
        ) : null}
      </AccessibleDialog>
    </div>
  );
}
