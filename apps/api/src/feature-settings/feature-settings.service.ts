import { createHash } from 'node:crypto';

import {
  ConflictException,
  Inject,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PlatformFeatureState, Prisma, prisma } from '@mensah-rentals/database';
import type {
  AdminFeatureSettingsResponse,
  AdminFeatureAvailabilityResponse,
  FeatureTransitionPreviewResponse,
  PlatformFeatureKey,
  PlatformFeatureState as FeatureState,
  PublicPlatformCapabilitiesResponse,
} from '@mensah-rentals/types';
import {
  FEATURE_DEPENDENCIES,
  FEATURE_PRESET_STATES,
  isFeatureAvailable,
  platformFeatureKeys,
  type ApiEnvironment,
  type FeatureChangeInput,
  type FeatureChangePreviewInput,
  type FeaturePresetApplyInput,
  type FeaturePresetPreviewInput,
  type PlatformEnvironment,
} from '@mensah-rentals/validation';

import {
  FEATURE_DETAILS,
  FEATURE_STATE_RANK,
} from './feature-settings.constants';
import { FeatureOperationCoordinator } from './feature-operation-coordinator';

type StateMap = Record<PlatformFeatureKey, FeatureState>;
type VersionMap = Record<PlatformFeatureKey, number>;

@Injectable()
export class FeatureSettingsService {
  constructor(
    @Inject(ConfigService)
    private readonly config: ConfigService<ApiEnvironment, true>,
    @Inject(FeatureOperationCoordinator)
    private readonly coordinator: FeatureOperationCoordinator,
  ) {}

  private environment(): PlatformEnvironment {
    return this.config.get('PLATFORM_ENVIRONMENT', { infer: true });
  }

  async list(): Promise<AdminFeatureSettingsResponse> {
    const rows = await prisma.platformFeatureSetting.findMany({
      orderBy: { key: 'asc' },
    });
    const dependents = this.dependents();
    return {
      environment: this.environment(),
      features: rows.map((row) => ({
        dependencies: [...FEATURE_DEPENDENCIES[row.key]],
        dependents: dependents[row.key],
        description: FEATURE_DETAILS[row.key].description,
        key: row.key,
        label: FEATURE_DETAILS[row.key].label,
        state: row.state,
        updatedAt: row.updatedAt.toISOString(),
        version: row.version,
      })),
    };
  }

  async publicCapabilities(): Promise<PublicPlatformCapabilitiesResponse> {
    const rows = await prisma.platformFeatureSetting.findMany({
      where: { key: { in: ['RENTAL_REQUESTS', 'CUSTOMER_ORDER_PORTAL'] } },
      select: { key: true, state: true },
    });
    const states = Object.fromEntries(
      rows.map((row) => [row.key, row.state]),
    ) as Partial<StateMap>;
    const environment = this.environment();
    return {
      customerOrderPortal: isFeatureAvailable(
        states.CUSTOMER_ORDER_PORTAL ?? 'DISABLED',
        environment,
        'PUBLIC',
      ),
      rentalRequests: isFeatureAvailable(
        states.RENTAL_REQUESTS ?? 'DISABLED',
        environment,
        'PUBLIC',
      ),
    };
  }

  async adminAvailability(): Promise<AdminFeatureAvailabilityResponse> {
    const rows = await prisma.platformFeatureSetting.findMany({
      select: { key: true, state: true },
    });
    const environment = this.environment();
    return {
      features: rows.map((row) => ({
        available: isFeatureAvailable(row.state, environment, 'ADMIN'),
        key: row.key,
        testing: row.state === 'INTERNAL_TESTING',
      })),
    };
  }

  async assertAvailable(key: PlatformFeatureKey, audience: 'ADMIN' | 'PUBLIC') {
    const row = await prisma.platformFeatureSetting.findUnique({
      where: { key },
    });
    const state = row?.state ?? 'DISABLED';
    if (!isFeatureAvailable(state, this.environment(), audience)) {
      throw new ConflictException({
        code: 'FEATURE_UNAVAILABLE',
        error: 'Conflict',
        message: 'This feature is currently unavailable.',
        statusCode: 409,
      });
    }
  }

  async preview(
    input: FeatureChangePreviewInput,
  ): Promise<FeatureTransitionPreviewResponse> {
    return prisma.$transaction(async (tx) => {
      const { states } = await this.current(tx);
      return this.withLiveBlockers(this.buildPreview(states, input), tx);
    });
  }

  async previewPreset(
    input: FeaturePresetPreviewInput,
  ): Promise<FeatureTransitionPreviewResponse> {
    return prisma.$transaction(async (tx) => {
      const { states } = await this.current(tx);
      return this.withLiveBlockers(
        this.buildPresetPreview(states, input.preset),
        tx,
      );
    });
  }

  async apply(actorUserId: string, input: FeatureChangeInput) {
    const payloadHash = this.hash(input);
    return this.coordinator.withWrite(() =>
      prisma.$transaction(
        async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(1885, 1)`;
          const replay = await this.replay(tx, input.operationId, payloadHash);
          if (replay) return replay;
          const current = await this.current(tx);
          const preview = await this.withLiveBlockers(
            this.buildPreview(current.states, input),
            tx,
          );
          this.validateMutation(
            preview,
            input.reason,
            current.versions,
            input.expectedVersions,
          );
          return this.commit(
            tx,
            actorUserId,
            input.operationId,
            payloadHash,
            preview,
            input.reason,
            'FEATURE_STATE_CHANGED',
          );
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );
  }

  async applyPreset(actorUserId: string, input: FeaturePresetApplyInput) {
    const payloadHash = this.hash(input);
    return this.coordinator.withWrite(() =>
      prisma.$transaction(
        async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(1885, 1)`;
          const replay = await this.replay(tx, input.operationId, payloadHash);
          if (replay) return replay;
          const current = await this.current(tx);
          const preview = await this.withLiveBlockers(
            this.buildPresetPreview(current.states, input.preset),
            tx,
          );
          this.validateMutation(
            preview,
            input.reason,
            current.versions,
            input.expectedVersions,
          );
          return this.commit(
            tx,
            actorUserId,
            input.operationId,
            payloadHash,
            preview,
            input.reason,
            'FEATURE_PRESET_APPLIED',
            input.preset,
          );
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );
  }

  private async current(tx: Prisma.TransactionClient | typeof prisma = prisma) {
    const rows = await tx.platformFeatureSetting.findMany();
    const states = Object.fromEntries(
      rows.map((row) => [row.key, row.state]),
    ) as StateMap;
    const versions = Object.fromEntries(
      rows.map((row) => [row.key, row.version]),
    ) as VersionMap;
    for (const key of platformFeatureKeys) {
      states[key] ??= 'ENABLED';
      versions[key] ??= 0;
    }
    return { states, versions };
  }

  private buildPreview(states: StateMap, input: FeatureChangePreviewInput) {
    const desired = { ...states };
    desired[input.featureKey] = input.state;
    const blockers: string[] = [];
    if (input.state !== 'DISABLED') {
      const required = this.recursiveDependencies(input.featureKey);
      for (const key of required) {
        if (
          FEATURE_STATE_RANK[desired[key]] < FEATURE_STATE_RANK[input.state]
        ) {
          if (input.includeDependencies) desired[key] = input.state;
          else
            blockers.push(
              `${FEATURE_DETAILS[input.featureKey].label} requires ${FEATURE_DETAILS[key].label} at the same or a broader rollout state.`,
            );
        }
      }
    } else {
      for (const key of this.recursiveDependents(input.featureKey)) {
        if (desired[key] !== 'DISABLED') {
          if (input.includeDependents) desired[key] = 'DISABLED';
          else
            blockers.push(
              `${FEATURE_DETAILS[key].label} depends on ${FEATURE_DETAILS[input.featureKey].label}.`,
            );
        }
      }
    }
    return this.previewFromMaps(states, desired, blockers);
  }

  private buildPresetPreview(
    states: StateMap,
    preset: keyof typeof FEATURE_PRESET_STATES,
  ) {
    return this.previewFromMaps(
      states,
      { ...FEATURE_PRESET_STATES[preset] },
      [],
    );
  }

  private previewFromMaps(
    states: StateMap,
    desired: StateMap,
    blockers: string[],
  ) {
    const changes = platformFeatureKeys.flatMap((featureKey) =>
      states[featureKey] === desired[featureKey]
        ? []
        : [{ featureKey, from: states[featureKey], to: desired[featureKey] }],
    );
    return {
      blockers: [...new Set(blockers)],
      changes,
      requiresReason: changes.some((change) => change.to === 'DISABLED'),
    } satisfies FeatureTransitionPreviewResponse;
  }

  private async withLiveBlockers(
    preview: FeatureTransitionPreviewResponse,
    tx: Prisma.TransactionClient,
  ) {
    const disabling = new Set(
      preview.changes
        .filter((change) => change.to === 'DISABLED')
        .map((change) => change.featureKey),
    );
    const blockers = [...preview.blockers];
    const checks: Array<[PlatformFeatureKey, () => Promise<number>, string]> = [
      [
        'RENTAL_REQUESTS',
        async () => {
          const [awaitingReview, approvedCandidates] = await Promise.all([
            tx.rentalRequest.count({
              where: {
                status: {
                  in: ['SUBMITTED', 'UNDER_REVIEW', 'RE_REVIEW_REQUIRED'],
                },
              },
            }),
            tx.rentalRequest.findMany({
              where: {
                status: { in: ['APPROVED', 'PARTIALLY_APPROVED'] },
                currentRevision: {
                  is: { decision: { is: { supersededAt: null } } },
                },
              },
              select: {
                currentRevision: {
                  select: { decision: { select: { id: true } } },
                },
                quote: {
                  select: {
                    revisions: {
                      select: { rentalRequestDecisionId: true },
                    },
                  },
                },
              },
            }),
          ]);
          const awaitingQuote = approvedCandidates.filter((request) => {
            const decisionId = request.currentRevision?.decision?.id;
            return (
              decisionId &&
              !request.quote?.revisions.some(
                (revision) => revision.rentalRequestDecisionId === decisionId,
              )
            );
          }).length;
          return awaitingReview + awaitingQuote;
        },
        'Rental requests are still waiting for review, re-review, or commercial follow-up.',
      ],
      [
        'QUOTES_AND_ORDERS',
        async () => {
          const [commercialQuotes, unreservedOrders, activeChangeRequests] =
            await Promise.all([
              tx.quote.count({
                where: {
                  OR: [
                    {
                      latestRevision: {
                        is: {
                          lifecycle: {
                            is: { state: { in: ['DRAFT', 'SENT', 'VIEWED'] } },
                          },
                        },
                      },
                    },
                    {
                      latestRevision: {
                        is: { lifecycle: { is: { state: 'ACCEPTED' } } },
                      },
                      rentalOrder: { is: null },
                    },
                  ],
                },
              }),
              tx.rentalOrder.count({
                where: {
                  reservationStatus: {
                    in: ['NOT_RESERVED', 'RESERVATION_FAILED'],
                  },
                },
              }),
              tx.rentalChangeRequest.count({
                where: {
                  status: {
                    in: ['SUBMITTED', 'UNDER_REVIEW', 'APPROVED_FOR_REQUOTE'],
                  },
                },
              }),
            ]);
          return commercialQuotes + unreservedOrders + activeChangeRequests;
        },
        'Quotes, confirmed orders, or change requests still require commercial handling.',
      ],
      [
        'CUSTOMER_ORDER_PORTAL',
        async () => {
          const now = new Date();
          const [quotes, orders] = await Promise.all([
            tx.quoteCustomerAccess.count({
              where: { expiresAt: { gt: now }, revokedAt: null },
            }),
            tx.orderCustomerAccess.count({
              where: { expiresAt: { gt: now }, revokedAt: null },
            }),
          ]);
          return quotes + orders;
        },
        'Active customer quote or order access links are still in use.',
      ],
      [
        'RESERVATIONS',
        () =>
          tx.inventoryReservation.count({
            where: {
              status: {
                in: ['PARTIALLY_RESERVED', 'RESERVED', 'PARTIALLY_CONSUMED'],
              },
            },
          }),
        'Active reservations still require operational handling.',
      ],
      [
        'FULFILMENT',
        () =>
          tx.orderFulfilment.count({
            where: {
              status: { in: ['PREPARING', 'READY', 'PARTIALLY_CHECKED_OUT'] },
            },
          }),
        'Fulfilments are still being prepared or checked out.',
      ],
      [
        'RETURNS',
        () =>
          tx.activeRental.count({ where: { status: { not: 'COMPLETED' } } }),
        'Active rentals still require return processing.',
      ],
      [
        'DAMAGED_RETURN_HANDLING',
        () => tx.rentalIssue.count({ where: { status: { not: 'RESOLVED' } } }),
        'Unresolved return issues still require damaged-return handling.',
      ],
      [
        'MAINTENANCE',
        () =>
          tx.maintenanceWorkOrder.count({
            where: { status: { notIn: ['COMPLETED', 'CANCELLED'] } },
          }),
        'Open maintenance work orders still require handling.',
      ],
      [
        'INSPECTIONS',
        () =>
          tx.equipmentInspection.count({
            where: { status: { in: ['SCHEDULED', 'IN_PROGRESS'] } },
          }),
        'Active inspections still require handling.',
      ],
    ];
    for (const [key, count, message] of checks) {
      if (disabling.has(key) && (await count()) > 0) blockers.push(message);
    }
    return { ...preview, blockers: [...new Set(blockers)] };
  }

  private validateMutation(
    preview: FeatureTransitionPreviewResponse,
    reason: string | undefined,
    currentVersions: VersionMap,
    expectedVersions: Partial<VersionMap>,
  ) {
    if (preview.blockers.length) {
      throw new UnprocessableEntityException({
        blockers: preview.blockers,
        code: 'FEATURE_TRANSITION_BLOCKED',
        error: 'Unprocessable Entity',
        message: 'The feature configuration cannot be changed safely.',
        statusCode: 422,
      });
    }
    if (preview.requiresReason && !reason) {
      throw new UnprocessableEntityException({
        code: 'FEATURE_REASON_REQUIRED',
        error: 'Unprocessable Entity',
        message: 'A reason is required when disabling operational features.',
        statusCode: 422,
      });
    }
    for (const [featureKey, expectedVersion] of Object.entries(
      expectedVersions,
    ) as Array<[PlatformFeatureKey, number]>) {
      if (expectedVersion !== currentVersions[featureKey]) {
        throw new ConflictException({
          code: 'FEATURE_SETTINGS_STALE',
          error: 'Conflict',
          message: 'Feature settings changed. Refresh and try again.',
          statusCode: 409,
        });
      }
    }
  }

  private async commit(
    tx: Prisma.TransactionClient,
    actorUserId: string,
    operationId: string,
    payloadHash: string,
    preview: FeatureTransitionPreviewResponse,
    reason: string | undefined,
    action: 'FEATURE_STATE_CHANGED' | 'FEATURE_PRESET_APPLIED',
    preset?: string,
  ) {
    for (const change of preview.changes) {
      await tx.platformFeatureSetting.update({
        where: { key: change.featureKey },
        data: {
          state: change.to as PlatformFeatureState,
          updatedByUserId: actorUserId,
          version: { increment: 1 },
        },
      });
    }
    await tx.platformAuditEvent.create({
      data: {
        action,
        actorUserId,
        domain: 'FEATURE_SETTINGS',
        entityReference:
          preset ?? preview.changes[0]?.featureKey ?? 'NO_CHANGE',
        entityType: preset ? 'PlatformFeaturePreset' : 'PlatformFeatureSetting',
        metadata: {
          changes: preview.changes.map((change) => ({ ...change })),
          operationId,
          payloadHash,
          ...(preset ? { preset } : {}),
          ...(reason ? { reason } : {}),
        } as Prisma.InputJsonValue,
        sourceKey: `feature-settings:${operationId}`,
        sourceType: action,
        summary: preset
          ? `Applied feature preset ${preset}.`
          : 'Updated platform feature settings.',
      },
    });
    return this.listWith(tx);
  }

  private async replay(
    tx: Prisma.TransactionClient,
    operationId: string,
    payloadHash: string,
  ) {
    const event = await tx.platformAuditEvent.findUnique({
      where: { sourceKey: `feature-settings:${operationId}` },
    });
    if (!event) return null;
    const metadata = event.metadata as { payloadHash?: string } | null;
    if (metadata?.payloadHash !== payloadHash) {
      throw new ConflictException({
        code: 'OPERATION_ID_CONFLICT',
        error: 'Conflict',
        message: 'This operation ID was already used for a different change.',
        statusCode: 409,
      });
    }
    return this.listWith(tx);
  }

  private async listWith(
    tx: Prisma.TransactionClient,
  ): Promise<AdminFeatureSettingsResponse> {
    const rows = await tx.platformFeatureSetting.findMany({
      orderBy: { key: 'asc' },
    });
    const dependents = this.dependents();
    return {
      environment: this.environment(),
      features: rows.map((row) => ({
        dependencies: [...FEATURE_DEPENDENCIES[row.key]],
        dependents: dependents[row.key],
        description: FEATURE_DETAILS[row.key].description,
        key: row.key,
        label: FEATURE_DETAILS[row.key].label,
        state: row.state,
        updatedAt: row.updatedAt.toISOString(),
        version: row.version,
      })),
    };
  }

  private hash(value: unknown) {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
  }

  private dependents() {
    const result = platformFeatureKeys.reduce(
      (values, key) => ({ ...values, [key]: [] }),
      {} as Record<PlatformFeatureKey, PlatformFeatureKey[]>,
    );
    for (const [feature, dependencies] of Object.entries(
      FEATURE_DEPENDENCIES,
    ) as Array<[PlatformFeatureKey, readonly PlatformFeatureKey[]]>) {
      for (const dependency of dependencies) result[dependency].push(feature);
    }
    return result;
  }

  private recursiveDependencies(
    key: PlatformFeatureKey,
    seen = new Set<PlatformFeatureKey>(),
  ) {
    for (const dependency of FEATURE_DEPENDENCIES[key]) {
      if (!seen.has(dependency)) {
        seen.add(dependency);
        this.recursiveDependencies(dependency, seen);
      }
    }
    return seen;
  }

  private recursiveDependents(
    key: PlatformFeatureKey,
    seen = new Set<PlatformFeatureKey>(),
  ) {
    for (const dependent of this.dependents()[key]) {
      if (!seen.has(dependent)) {
        seen.add(dependent);
        this.recursiveDependents(dependent, seen);
      }
    }
    return seen;
  }
}
