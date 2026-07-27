import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

test.describe.configure({ timeout: 180_000 });

function credential(
  name: 'STAFF_BOOTSTRAP_EMAIL' | 'STAFF_BOOTSTRAP_PASSWORD',
) {
  if (process.env.MENSAH_ISOLATED_E2E !== 'verified-local-test-database')
    throw new Error(
      'Decision browser tests require the isolated test harness.',
    );
  const value = process.env[name];
  if (!value) throw new Error(`${name} is missing from the isolated harness.`);
  return value;
}

async function seriousAxe(page: Page, include?: string) {
  let builder = new AxeBuilder({ page }).withTags([
    'wcag2a',
    'wcag2aa',
    'wcag21aa',
  ]);
  if (include) builder = builder.include(include);
  const results = await builder.analyze();
  expect(
    results.violations.filter((violation) =>
      ['critical', 'serious'].includes(violation.impact ?? ''),
    ),
  ).toEqual([]);
}

function dateFromToday(days: number) {
  const value = new Date();
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

async function createTestOwnedRequest(page: Page, outcome: string) {
  await page.goto('http://localhost:3000/rentals');
  const hrefs = await page
    .locator('article a[href^="/rentals/"]')
    .evaluateAll((links) => [
      ...new Set(
        links.map((link) => link.getAttribute('href')).filter(Boolean),
      ),
    ]);
  expect(hrefs.length).toBeGreaterThanOrEqual(2);
  for (const [index, href] of hrefs.slice(0, 2).entries()) {
    await page.goto(`http://localhost:3000${href}`);
    await page.getByLabel('Desired quantity').fill(index === 0 ? '4' : '3');
    await page.getByRole('button', { name: 'Add to rental cart' }).click();
    await expect(page.getByText(/saved in your rental cart/i)).toBeVisible();
  }
  await page.goto('http://localhost:3000/cart');
  await page.getByRole('link', { name: 'Continue to rental request' }).click();
  const marker = `E2E-P10-${outcome}-${Date.now()}`;
  await page.getByLabel('First name').fill('Phase');
  await page.getByLabel('Last name').fill('Ten');
  await page.getByLabel('Email').fill(`${marker.toLowerCase()}@example.test`);
  await page.getByLabel('Phone').fill('+233 20 000 0010');
  await page.getByLabel('Project or event name').fill(marker);
  await page.getByLabel('Project or event type').fill('Browser verification');
  await page.getByLabel('Rental start date').fill(dateFromToday(7));
  await page.getByLabel('Rental end date').fill(dateFromToday(9));
  await page.getByLabel('Project or event location').fill('Accra');
  await page.getByRole('button', { name: 'Review request' }).click();
  await page.getByRole('button', { name: 'Submit rental request' }).click();
  try {
    await expect(page).toHaveURL(/\/rental-requests\/MR-\d{4}-/, {
      timeout: 15_000,
    });
  } catch {
    // A single retry exercises the submission key's idempotent recovery from a
    // transient local dev-server response without hiding persistent failures.
    await page.getByRole('button', { name: 'Submit rental request' }).click();
    await expect(page).toHaveURL(/\/rental-requests\/MR-\d{4}-/, {
      timeout: 30_000,
    });
  }
  const reference = (await page.getByText(/Reference:/).innerText())
    .replace('Reference:', '')
    .trim();
  return { marker, reference };
}

async function loginAndOpen(page: Page, reference: string) {
  await page.goto('http://localhost:3001/login');
  await page.getByLabel(/email/i).fill(credential('STAFF_BOOTSTRAP_EMAIL'));
  await page
    .getByLabel(/password/i)
    .fill(credential('STAFF_BOOTSTRAP_PASSWORD'));
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL('http://localhost:3001/');
  await page.goto('http://localhost:3001/rental-requests');
  await page.getByLabel('Search requests').fill(reference);
  await page.getByRole('link', { name: reference, exact: true }).click();
  await page.getByRole('button', { name: 'Start review' }).click();
  await expect(page.getByText('Under Review').first()).toBeVisible();
}

async function confirmDecision(page: Page, trigger: string) {
  await page.getByRole('button', { name: trigger, exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Confirm final decision' }),
  ).toBeVisible();
  await seriousAxe(page, 'dialog');
  await page.keyboard.press('Escape');
  await expect(
    page.getByRole('button', { name: trigger, exact: true }),
  ).toBeFocused();
  await page.getByRole('button', { name: trigger, exact: true }).click();
  await page.getByRole('button', { name: 'Confirm decision' }).click();
}

function expectNoPrivateDecisionData(text: string, internalSentinel: string) {
  expect(text).not.toContain(internalSentinel);
  expect(text).not.toMatch(
    /operationId|payloadHash|reviewVersion|decidedBy|staff email|inventory transaction|activity history/i,
  );
}

function decisionAlert(page: Page) {
  return page.locator('[role="alert"]:not(#__next-route-announcer__)');
}

test('@admin-decisions @admin-decisions-approve test-owned full approval is final and publicly safe', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-1024');
  const owned = await createTestOwnedRequest(page, 'APPROVE');
  await loginAndOpen(page, owned.reference);
  const sentinel = `PRIVATE-APPROVAL-${Date.now()}`;
  await page.getByLabel('Internal reason', { exact: true }).fill(sentinel);
  await page
    .getByLabel('Customer-safe explanation')
    .fill('Please contact us before 5 PM to discuss the next step.');
  await confirmDecision(page, 'Approve');
  await expect(page.getByText('Approved').first()).toBeVisible();
  await expect(page.getByText(/quote eligibility: eligible/i)).toBeVisible();
  await expect(page.getByLabel('Assigned staff')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Approve', exact: true }),
  ).toHaveCount(0);
  await page.goto(`http://localhost:3000/rental-requests/${owned.reference}`);
  await expect(
    page.getByRole('heading', { name: 'Request approved' }),
  ).toBeVisible();
  await expect(page.getByText(/4 approved|3 approved/).first()).toBeVisible();
  expectNoPrivateDecisionData(await page.locator('body').innerText(), sentinel);
  await seriousAxe(page);
});

test('@admin-decisions @admin-decisions-partial test-owned partial approval validates every line and stays non-reserving', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-320');
  const owned = await createTestOwnedRequest(page, 'PARTIAL');
  await loginAndOpen(page, owned.reference);
  const isDark = await page
    .locator('html')
    .evaluate((node) => node.classList.contains('dark'));
  if (!isDark)
    await page.getByRole('button', { name: /switch to dark theme/i }).click();
  const sentinel = `PRIVATE-PARTIAL-${Date.now()}`;
  await page.getByLabel('Internal reason', { exact: true }).fill(sentinel);
  await page.getByRole('button', { name: 'Partially approve' }).click();
  await expect(decisionAlert(page)).toContainText(
    /changed quantity|customer-safe/i,
  );
  const quantities = page.locator('fieldset input[type="number"]');
  await expect(quantities).toHaveCount(2);
  const requested = await Promise.all(
    [0, 1].map(async (index) =>
      Number(await quantities.nth(index).getAttribute('max')),
    ),
  );
  const approved = [Math.max(1, requested[0] - 1), requested[1]];
  for (const requestedQuantity of requested)
    await expect(
      page.getByText(`(${requestedQuantity} requested)`, { exact: false }),
    ).toBeVisible();
  await expect(page.getByLabel(/requested quantity/i)).toHaveCount(0);
  await quantities.nth(0).fill(String(approved[0]));
  await page.getByRole('button', { name: 'Partially approve' }).click();
  await expect(decisionAlert(page)).toContainText(/customer-safe/i);
  await page
    .getByLabel('Customer-safe explanation')
    .fill('We can discuss an alternative package for 20 guests.');
  await quantities.nth(0).fill(String(requested[0] + 1));
  await page.getByRole('button', { name: 'Partially approve' }).click();
  await expect(decisionAlert(page)).toContainText(/cannot exceed/i);
  await quantities.nth(0).fill('0');
  await quantities.nth(1).fill('0');
  await page.getByRole('button', { name: 'Partially approve' }).click();
  await expect(decisionAlert(page)).toContainText(/positive/i);
  await quantities.nth(0).fill(String(approved[0]));
  await quantities.nth(1).fill(String(approved[1]));
  await page.getByRole('button', { name: 'Partially approve' }).click();
  const confirmation = page.getByRole('dialog');
  await expect(confirmation.locator('li')).toHaveCount(requested.length);
  for (const requestedQuantity of requested)
    await expect(
      confirmation
        .locator('li')
        .filter({ hasText: `${requestedQuantity} requested` }),
    ).toHaveCount(1);
  await page.keyboard.press('Escape');
  await confirmDecision(page, 'Partially approve');
  await expect(page.getByText('Partially Approved').first()).toBeVisible();
  for (const [index, approvedQuantity] of approved.entries()) {
    await expect(
      page.getByText(
        `${approvedQuantity} approved of ${requested[index]} requested`,
      ),
    ).toBeVisible();
  }
  await expect(page.getByText(/quote eligibility: eligible/i)).toBeVisible();
  await expect(page.getByLabel('Assigned staff')).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
  await page.goto(`http://localhost:3000/rental-requests/${owned.reference}`);
  await expect(
    page.getByRole('heading', { name: 'Request partially approved' }),
  ).toBeVisible();
  const publicText = await page.locator('body').innerText();
  expect(publicText).toContain(`${approved[0]} approved`);
  expect(publicText).toContain(`${requested[0]} requested`);
  expectNoPrivateDecisionData(publicText, sentinel);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
  await seriousAxe(page);
});

test('@admin-decisions @admin-decisions-reject test-owned rejection requires safe reasons and exposes no approval quantities', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-1024');
  const owned = await createTestOwnedRequest(page, 'REJECT');
  await loginAndOpen(page, owned.reference);
  await page.getByRole('button', { name: 'Reject', exact: true }).click();
  await expect(decisionAlert(page)).toContainText(
    /internal reason|customer-safe/i,
  );
  const sentinel = `PRIVATE-REJECTION-${Date.now()}`;
  await page.getByLabel('Internal reason', { exact: true }).fill(sentinel);
  await page.getByRole('button', { name: 'Reject', exact: true }).click();
  await expect(decisionAlert(page)).toContainText(/customer-safe/i);
  const safe = 'Your event date can be moved to August 12. Please contact us.';
  await page.getByLabel('Customer-safe explanation').fill(safe);
  let captured: { body: Record<string, unknown>; url: string } | undefined;
  page.on('request', (request) => {
    if (
      !captured &&
      request.method() === 'POST' &&
      request.url().includes('/decisions/reject')
    )
      captured = {
        body: request.postDataJSON() as Record<string, unknown>,
        url: request.url(),
      };
  });
  await confirmDecision(page, 'Reject');
  await expect(page.getByText('Rejected').first()).toBeVisible();
  expect(captured).toBeDefined();
  const replay = async () =>
    page.evaluate(async (submission) => {
      const response = await fetch(submission!.url, {
        body: JSON.stringify(submission!.body),
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });
      return {
        body: (await response.json()) as { id?: string },
        status: response.status,
      };
    }, captured);
  const firstReplay = await replay();
  const secondReplay = await replay();
  expect(firstReplay.status).toBe(201);
  expect(secondReplay.status).toBe(201);
  expect(firstReplay.body.id).toBeTruthy();
  expect(secondReplay.body.id).toBe(firstReplay.body.id);
  await expect(
    page.getByText(/quote eligibility: not eligible/i),
  ).toBeVisible();
  await expect(page.getByLabel('Assigned staff')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Reject', exact: true }),
  ).toHaveCount(0);
  await page.reload();
  await expect(page.getByText('Rejected').first()).toBeVisible();
  await page.goto(`http://localhost:3000/rental-requests/${owned.reference}`);
  await expect(
    page.getByRole('heading', { name: 'Request not approved' }),
  ).toBeVisible();
  await expect(page.getByText(safe)).toBeVisible();
  await expect(page.getByText(/^\d+ approved$/)).toHaveCount(0);
  expectNoPrivateDecisionData(await page.locator('body').innerText(), sentinel);
  await seriousAxe(page);
});
