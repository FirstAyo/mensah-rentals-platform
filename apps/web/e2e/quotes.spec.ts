import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

test.describe.configure({ timeout: 180_000 });

function credential(
  name: 'STAFF_BOOTSTRAP_EMAIL' | 'STAFF_BOOTSTRAP_PASSWORD',
) {
  const value = process.env[name];
  if (!value)
    throw new Error(`${name} is missing from the isolated quote harness.`);
  return value;
}
function future(days: number) {
  const value = new Date();
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
async function axe(page: Page) {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(
    result.violations.filter((entry) =>
      ['critical', 'serious'].includes(entry.impact ?? ''),
    ),
  ).toEqual([]);
}

async function approvedRequest(page: Page) {
  await page.goto('http://localhost:3000/rentals');
  const href = await page
    .locator('article a[href^="/rentals/"]')
    .first()
    .getAttribute('href');
  expect(href).toBeTruthy();
  await page.goto(`http://localhost:3000${href}`);
  await page.getByLabel('Desired quantity').fill('3');
  await page.getByRole('button', { name: 'Add to rental cart' }).click();
  await expect(page.getByText(/saved in your rental cart/i)).toBeVisible();
  await page.goto('http://localhost:3000/cart');
  await page.getByRole('link', { name: 'Continue to rental request' }).click();
  const marker = `E2E-P11-${Date.now()}`;
  await page.getByLabel('First name').fill('Quote');
  await page.getByLabel('Last name').fill('Customer');
  await page.getByLabel('Email').fill(`${marker.toLowerCase()}@example.test`);
  await page.getByLabel('Phone').fill('+233 20 000 0011');
  await page.getByLabel('Project or event name').fill(marker);
  await page.getByLabel('Project or event type').fill('Quote browser test');
  await page.getByLabel('Rental start date').fill(future(7));
  await page.getByLabel('Rental end date').fill(future(9));
  await page.getByLabel('Project or event location').fill('Accra');
  await page.getByRole('button', { name: 'Review request' }).click();
  await page.getByRole('button', { name: 'Submit rental request' }).click();
  await expect(page).toHaveURL(/rental-requests\/MR-/);
  const reference = (await page.getByText(/Reference:/).innerText())
    .replace('Reference:', '')
    .trim();
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
  await page
    .getByLabel('Internal reason', { exact: true })
    .fill('P11 isolated quote fixture');
  await page.getByRole('button', { name: 'Approve', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm decision' }).click();
  await expect(page.getByText('Approved').first()).toBeVisible();
  return { marker, reference };
}

async function createAndSend(page: Page) {
  const owned = await approvedRequest(page);
  await page.getByRole('link', { name: 'Create quote' }).click();
  const unitPrices = page.getByLabel('Unit price (CAD)');
  await expect(unitPrices.first()).toBeVisible();
  await unitPrices.first().fill('not-money');
  await expect(
    page.getByText(/enter valid bounded money and tax values/i),
  ).toBeVisible();
  for (let index = 0; index < (await unitPrices.count()); index += 1)
    await unitPrices.nth(index).fill('125.50');
  await page.getByRole('button', { name: 'Add charge' }).click();
  await page.getByLabel('Type').selectOption('DELIVERY');
  await page.getByLabel('Customer label').fill('Delivery');
  await page.getByLabel('Amount (CAD)').fill('10.00');
  await page.getByLabel('Discount (CAD)').fill('5.00');
  await page.getByLabel('Tax rate (%)').fill('5');
  const valid = new Date();
  valid.setDate(valid.getDate() + 5);
  await page.getByLabel(/Valid until/).fill(valid.toISOString().slice(0, 16));
  await page.getByLabel('Customer notes').fill('Customer-visible quote note');
  await page.getByLabel('Internal notes').fill('PRIVATE-P11-SENTINEL');
  await page.getByLabel('Terms').fill('Custom quote terms.');
  await expect(page.getByText('$400.58', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Create draft quote' }).dblclick();
  await expect(page).toHaveURL(/\/quotes\//);
  await expect(page.getByText('DRAFT').first()).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Send current revision' }).click();
  await expect(
    page.getByRole('heading', { name: 'Secure customer link' }),
  ).toBeVisible();
  const link = await page.locator('code').innerText();
  return { ...owned, link };
}

test('@quotes @admin-quotes creates exact quote and sends without reservation controls', async ({
  page,
}, info) => {
  test.skip(!['mobile-320', 'desktop-1024'].includes(info.project.name));
  await createAndSend(page);
  await expect(
    page.getByText(/inventory is not reserved/i).first(),
  ).toBeVisible();
  expect(await page.locator('body').innerText()).not.toMatch(
    /create order|reserve now|assign asset/i,
  );
  if (info.project.name === 'mobile-320') {
    await page.getByRole('button', { name: /switch to dark theme/i }).click();
    await expect(page.locator('html')).toHaveClass(/dark/);
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    ).toBe(true);
  }
  await axe(page);
});

test('@quotes @admin-quotes creates immutable revision, supersedes old access, and records rejection', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'wide-1440');
  const { link: oldLink } = await createAndSend(page);
  await page.getByRole('button', { name: 'Create new revision' }).click();
  await expect(
    page.getByRole('heading', { name: 'Create quote revision' }),
  ).toBeVisible();
  await page.getByLabel('Unit price (CAD)').first().fill('130.00');
  await page.getByRole('button', { name: 'Create immutable revision' }).click();
  await expect(page.getByText('Revision 2')).toBeVisible();
  await expect(page.getByText('Revision 1')).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Send current revision' }).click();
  await expect(
    page.getByRole('heading', { name: 'Secure customer link' }),
  ).toBeVisible();
  const newLink = await page.locator('code').innerText();

  await page.goto(oldLink);
  await expect(page.getByText('This quote link is unavailable.')).toBeVisible();
  await expect(page).toHaveURL('http://localhost:3000/quote/access');
  await page.goto(newLink);
  await expect(page.getByRole('heading', { name: /Quote QT-/ })).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Reject quote' }).click();
  await expect(page.getByText(/rejected and no longer/i)).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Reject quote' })).toHaveCount(
    0,
  );
  await axe(page);
});

test('@quotes @customer-quotes exchanges fragment, hides internal notes, and accepts', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'mobile-320');
  const { link } = await createAndSend(page);
  await page.goto(link);
  await expect(page).toHaveURL('http://localhost:3000/quote');
  await expect(page.getByRole('heading', { name: /Quote QT-/ })).toBeVisible();
  const body = await page.locator('body').innerText();
  expect(body).not.toContain('PRIVATE-P11-SENTINEL');
  expect(body).toMatch(/not a confirmed rental order/i);
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Accept quote' }).click();
  await expect(page.getByText(/accepted and no longer/i)).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Accept quote' })).toHaveCount(
    0,
  );
  await axe(page);
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
});
