import { randomUUID } from 'node:crypto';

import { prisma, runRbacSeed } from '@mensah-rentals/database';
import type { StaffUserResponse } from '@mensah-rentals/types';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { RentalRequestDecisionService } from '../rental-request/rental-request-decision.service';
import { FeatureSettingsService } from './feature-settings.service';
import { FeatureOperationCoordinator } from './feature-operation-coordinator';

describe('feature settings against PostgreSQL', () => {
  const service = new FeatureSettingsService(
    {
      get: (key: string) =>
        key === 'PLATFORM_ENVIRONMENT' ? 'LOCAL' : undefined,
    } as never,
    new FeatureOperationCoordinator(),
  );
  const decisions = new RentalRequestDecisionService();
  let actor: StaffUserResponse;
  let actorId: string;
  let productId: string;

  async function createRequestWithRevision(
    status: 'APPROVED' | 'PARTIALLY_APPROVED' | 'UNDER_REVIEW',
  ) {
    const suffix = randomUUID().replaceAll('-', '');
    const result = await prisma.$transaction(async (tx) => {
      const request = await tx.rentalRequest.create({
        data: {
          contactEmail: `feature-${suffix}@example.test`,
          contactFirstName: 'Feature',
          contactLastName: 'Blocker',
          contactPhone: '+233 20 000 0000',
          fulfillmentMethod: 'PICKUP',
          projectLocation: 'Accra',
          projectName: `Feature blocker ${suffix}`,
          projectType: 'Test',
          referenceNumber: `MR-2027-${suffix.slice(0, 10).toUpperCase()}`,
          rentalEndDate: new Date('2027-08-02T00:00:00Z'),
          rentalStartDate: new Date('2027-08-01T00:00:00Z'),
          requestedTimeZone: 'Africa/Accra',
          reviewStartedAt: new Date(),
          reviewVersion: 1,
          sourceCartTokenHash: suffix.padEnd(64, 'a').slice(0, 64),
          status: 'UNDER_REVIEW',
          submissionKeyHash: suffix.padEnd(64, 'b').slice(0, 64),
          submissionPayloadHash: suffix.padEnd(64, 'c').slice(0, 64),
          items: {
            create: {
              categoryName: 'Feature control fixtures',
              categorySlug: 'feature-control-fixtures',
              productId,
              productName: 'Feature control product',
              productSlug: `feature-control-product-${suffix}`,
              rentalUnit: 'each',
              requestedQuantity: 2,
            },
          },
        },
        include: { items: true },
      });
      const revision = await tx.rentalRequestRevision.create({
        data: {
          contactEmail: request.contactEmail,
          contactFirstName: request.contactFirstName,
          contactLastName: request.contactLastName,
          contactPhone: request.contactPhone,
          fulfillmentMethod: request.fulfillmentMethod,
          operationId: randomUUID(),
          payloadHash: suffix.padEnd(64, 'd').slice(0, 64),
          projectLocation: request.projectLocation,
          projectName: request.projectName,
          projectType: request.projectType,
          rentalEndDate: request.rentalEndDate,
          rentalRequestId: request.id,
          rentalStartDate: request.rentalStartDate,
          requestedTimeZone: request.requestedTimeZone,
          revisionNumber: 1,
          submittedByType: 'ORIGINAL_SUBMISSION',
          items: {
            create: request.items.map((item, sortOrder) => ({
              categoryNameSnapshot: item.categoryName,
              categorySlugSnapshot: item.categorySlug,
              productId: item.productId,
              productNameSnapshot: item.productName,
              productSlugSnapshot: item.productSlug,
              rentalUnitSnapshot: item.rentalUnit,
              requestedQuantity: item.requestedQuantity,
              sortOrder,
            })),
          },
        },
        include: { items: true },
      });
      await tx.rentalRequest.update({
        where: { id: request.id },
        data: { currentRevisionId: revision.id },
      });
      return { request, revision, suffix };
    });
    if (status === 'APPROVED') {
      await decisions.approve(actor, result.request.id, {
        customerExplanation: null,
        expectedReviewVersion: 1,
        internalReason: 'Approved feature-control blocker fixture.',
        operationId: randomUUID(),
      });
    } else if (status === 'PARTIALLY_APPROVED') {
      await decisions.partiallyApprove(actor, result.request.id, {
        customerExplanation:
          'Only part of the requested quantity can be supplied.',
        expectedReviewVersion: 1,
        internalReason: 'Partially approved feature-control blocker fixture.',
        items: [
          {
            approvedQuantity: 1,
            rentalRequestItemId: result.revision.items[0]!.id,
          },
        ],
        operationId: randomUUID(),
      });
    }
    return result;
  }

  beforeAll(async () => {
    await runRbacSeed(prisma);
    const role = await prisma.role.findUniqueOrThrow({
      where: { name: 'ADMIN' },
    });
    const user = await prisma.user.create({
      data: {
        email: `feature-settings-${randomUUID()}@example.test`,
        firstName: 'Feature',
        lastName: 'Operator',
        passwordHash: 'not-used',
        roles: { create: { roleId: role.id } },
        status: 'ACTIVE',
      },
    });
    actorId = user.id;
    const adminRole = await prisma.role.findUniqueOrThrow({
      where: { name: 'ADMIN' },
      include: { permissions: { include: { permission: true } } },
    });
    actor = {
      createdAt: user.createdAt.toISOString(),
      email: user.email,
      firstName: user.firstName,
      id: user.id,
      lastLoginAt: null,
      lastName: user.lastName,
      permissionKeys: adminRole.permissions.map(
        ({ permission }) => permission.key,
      ),
      roles: [
        {
          displayName: adminRole.displayName,
          id: adminRole.id,
          name: adminRole.name,
        },
      ],
      status: 'ACTIVE',
      updatedAt: user.updatedAt.toISOString(),
    };
    const category = await prisma.category.create({
      data: {
        name: `Feature controls ${randomUUID()}`,
        slug: `feature-controls-${randomUUID()}`,
      },
    });
    productId = (
      await prisma.product.create({
        data: {
          categoryId: category.id,
          name: 'Feature control fixture',
          shortDescription: 'Feature-control live-work blocker fixture.',
          slug: `feature-control-fixture-${randomUUID()}`,
        },
      })
    ).id;
    await prisma.platformFeatureSetting.updateMany({
      data: { state: 'ENABLED', updatedByUserId: null, version: 0 },
    });
  });

  afterAll(async () => {
    await prisma.platformFeatureSetting.updateMany({
      data: { state: 'ENABLED', updatedByUserId: null },
    });
  });

  it('starts with every existing operational feature enabled', async () => {
    const settings = await service.list();
    expect(settings.features).toHaveLength(11);
    expect(
      settings.features.every((feature) => feature.state === 'ENABLED'),
    ).toBe(true);
  });

  it('persists, audits, replays idempotently, and rejects stale writes', async () => {
    const before = await service.list();
    const reporting = before.features.find(
      (feature) => feature.key === 'OPERATIONAL_REPORTING',
    )!;
    const operationId = randomUUID();
    const input = {
      expectedVersions: { OPERATIONAL_REPORTING: reporting.version },
      featureKey: 'OPERATIONAL_REPORTING' as const,
      includeDependencies: false,
      includeDependents: false,
      operationId,
      state: 'INTERNAL_TESTING' as const,
    };
    const first = await service.apply(actorId, input);
    const replay = await service.apply(actorId, input);
    expect(
      first.features.find((feature) => feature.key === 'OPERATIONAL_REPORTING')
        ?.state,
    ).toBe('INTERNAL_TESTING');
    expect(
      replay.features.find((feature) => feature.key === 'OPERATIONAL_REPORTING')
        ?.version,
    ).toBe(
      first.features.find((feature) => feature.key === 'OPERATIONAL_REPORTING')
        ?.version,
    );
    expect(
      await prisma.platformAuditEvent.count({
        where: { sourceKey: `feature-settings:${operationId}` },
      }),
    ).toBe(1);
    await expect(
      service.apply(actorId, {
        ...input,
        operationId: randomUUID(),
        state: 'ENABLED',
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'FEATURE_SETTINGS_STALE' }),
    });
    await expect(
      service.apply(actorId, {
        ...input,
        operationId,
        state: 'ENABLED',
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'OPERATION_ID_CONFLICT' }),
    });
  });

  it('serializes concurrent writes so exactly one stale version can commit', async () => {
    await prisma.platformFeatureSetting.update({
      where: { key: 'OPERATIONAL_REPORTING' },
      data: { state: 'ENABLED', version: { increment: 1 } },
    });
    const current = await service.list();
    const reporting = current.features.find(
      (feature) => feature.key === 'OPERATIONAL_REPORTING',
    )!;
    const input = {
      expectedVersions: { OPERATIONAL_REPORTING: reporting.version },
      featureKey: 'OPERATIONAL_REPORTING' as const,
      includeDependencies: false,
      includeDependents: false,
      reason: 'Concurrent feature-control regression test.',
      state: 'DISABLED' as const,
    };
    const settled = await Promise.allSettled([
      service.apply(actorId, { ...input, operationId: randomUUID() }),
      service.apply(actorId, { ...input, operationId: randomUUID() }),
    ]);
    expect(settled.filter(({ status }) => status === 'fulfilled')).toHaveLength(
      1,
    );
    expect(settled.filter(({ status }) => status === 'rejected')).toHaveLength(
      1,
    );
  });

  it('requires explicit atomic dependency and dependent handling', async () => {
    await prisma.platformFeatureSetting.updateMany({
      data: { state: 'DISABLED', version: { increment: 1 } },
    });
    const current = await service.list();
    const versions = Object.fromEntries(
      current.features.map((feature) => [feature.key, feature.version]),
    );
    const blocked = await service.preview({
      featureKey: 'RESERVATIONS',
      includeDependencies: false,
      includeDependents: false,
      state: 'ENABLED',
    });
    expect(blocked.blockers.length).toBeGreaterThan(0);
    const applied = await service.apply(actorId, {
      expectedVersions: versions,
      featureKey: 'RESERVATIONS',
      includeDependencies: true,
      includeDependents: false,
      operationId: randomUUID(),
      state: 'ENABLED',
    });
    expect(
      applied.features.find((feature) => feature.key === 'RESERVATIONS')?.state,
    ).toBe('ENABLED');
    expect(
      applied.features.find((feature) => feature.key === 'INVENTORY_TRACKING')
        ?.state,
    ).toBe('ENABLED');
    expect(
      applied.features.find((feature) => feature.key === 'QUOTES_AND_ORDERS')
        ?.state,
    ).toBe('ENABLED');
    expect(
      applied.features.find((feature) => feature.key === 'RENTAL_REQUESTS')
        ?.state,
    ).toBe('ENABLED');
  });

  it('keeps the public capability DTO allowlisted and environment aware', async () => {
    await prisma.platformFeatureSetting.update({
      where: { key: 'CUSTOMER_ORDER_PORTAL' },
      data: { state: 'DISABLED' },
    });
    const response = await service.publicCapabilities();
    expect(response).toEqual({
      customerOrderPortal: false,
      rentalRequests: true,
    });
    expect(JSON.stringify(response)).not.toMatch(
      /version|actor|reason|dependency|inventory/i,
    );
  });

  it.each(['APPROVED', 'PARTIALLY_APPROVED'] as const)(
    'blocks disabling rental requests while a %s request awaits a quote',
    async (status) => {
      await createRequestWithRevision(status);
      const preview = await service.previewPreset({ preset: 'WEBSITE_ONLY' });
      expect(preview.blockers).toContain(
        'Rental requests are still waiting for review, re-review, or commercial follow-up.',
      );
    },
  );

  it('does not treat an approved request with a matching quote revision as awaiting its first quote', async () => {
    const result = await (
      service as unknown as {
        withLiveBlockers: (
          preview: {
            blockers: string[];
            changes: Array<{
              featureKey: 'RENTAL_REQUESTS';
              from: 'ENABLED';
              to: 'DISABLED';
            }>;
            requiresReason: boolean;
          },
          tx: unknown,
        ) => Promise<{ blockers: string[] }>;
      }
    ).withLiveBlockers(
      {
        blockers: [],
        changes: [
          {
            featureKey: 'RENTAL_REQUESTS',
            from: 'ENABLED',
            to: 'DISABLED',
          },
        ],
        requiresReason: true,
      },
      {
        rentalRequest: {
          count: async () => 0,
          findMany: async () => [
            {
              currentRevision: { decision: { id: 'decision-1' } },
              quote: {
                revisions: [{ rentalRequestDecisionId: 'decision-1' }],
              },
            },
          ],
        },
      },
    );
    expect(result.blockers).not.toContain(
      'Rental requests are still waiting for review, re-review, or commercial follow-up.',
    );
  });

  it('counts active formal change requests as commercial shutdown blockers', async () => {
    const result = await (
      service as unknown as {
        withLiveBlockers: (
          preview: {
            blockers: string[];
            changes: Array<{
              featureKey: 'QUOTES_AND_ORDERS';
              from: 'ENABLED';
              to: 'DISABLED';
            }>;
            requiresReason: boolean;
          },
          tx: unknown,
        ) => Promise<{ blockers: string[] }>;
      }
    ).withLiveBlockers(
      {
        blockers: [],
        changes: [
          {
            featureKey: 'QUOTES_AND_ORDERS',
            from: 'ENABLED',
            to: 'DISABLED',
          },
        ],
        requiresReason: true,
      },
      {
        quote: { count: async () => 0 },
        rentalChangeRequest: { count: async () => 1 },
        rentalOrder: { count: async () => 0 },
      },
    );
    expect(result.blockers).toContain(
      'Quotes, confirmed orders, or change requests still require commercial handling.',
    );
  });

  it('rolls a blocked preset back atomically', async () => {
    const before = await service.list();
    const expectedVersions = Object.fromEntries(
      before.features.map(({ key, version }) => [key, version]),
    );
    await expect(
      service.applyPreset(actorId, {
        expectedVersions,
        operationId: randomUUID(),
        preset: 'WEBSITE_ONLY',
        reason: 'Atomic blocker regression test.',
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        blockers: expect.arrayContaining([
          'Rental requests are still waiting for review, re-review, or commercial follow-up.',
        ]),
        code: 'FEATURE_TRANSITION_BLOCKED',
      }),
    });
    const after = await service.list();
    expect(
      after.features.map(({ key, state, version }) => ({
        key,
        state,
        version,
      })),
    ).toEqual(
      before.features.map(({ key, state, version }) => ({
        key,
        state,
        version,
      })),
    );
  });
});
