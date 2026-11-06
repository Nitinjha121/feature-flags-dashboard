import { expect, test, type Page } from '@playwright/test';

const RECEIVER_URL = process.env.RECEIVER_URL ?? 'http://localhost:4100';
const ACTOR = 'carol@husqvarna.dev';

const row = (page: Page, key: string, environment: string) =>
  page.locator(
    `[data-testid="flag-row"][data-flag-key="${key}"][data-environment="${environment}"]`,
  );
const auditEntry = (page: Page, key: string, action: string) =>
  page.locator(`[data-testid="audit-entry"][data-flag-key="${key}"][data-action="${action}"]`);

interface ReceivedWebhook {
  body: {
    type: string;
    data: { actor: string; flag: { key: string; environment: string; enabled: boolean } };
  };
}

/**
 * One full-stack journey through the real UI, API, Postgres, worker and webhook receiver:
 * list + filter → create (+ duplicate rejected) → toggle a prod flag → audit feed → webhook.
 */
test('manage feature flags end to end, including the async prod webhook', async ({
  page,
  request,
}) => {
  await page.goto('/');

  // Seeded data is there from the first boot.
  await expect(row(page, 'firmware-ota-v2', 'prod')).toBeVisible();
  await expect(page.getByTestId('flag-row').first()).toBeVisible();

  // Filtering by environment shows only prod flags.
  await page.getByTestId('filter-environment').selectOption('prod');
  await expect(page.locator('[data-testid="flag-row"]:not([data-environment="prod"])')).toHaveCount(
    0,
  );
  await expect(row(page, 'firmware-ota-v2', 'prod')).toBeVisible();
  await page.getByTestId('filter-environment').selectOption('');

  // Create a flag as a specific actor; it appears in the table and the activity feed.
  await page.getByTestId('actor-select').selectOption(ACTOR);
  const key = `e2e-flag-${Date.now()}`;
  const fillForm = async () => {
    await page.getByTestId('open-create').click();
    await page.getByTestId('create-key').fill(key);
    await page.getByTestId('create-description').fill('Created by the Playwright E2E test');
    await page.getByTestId('create-environment').selectOption('staging');
    await page.getByTestId('create-submit').click();
  };
  await fillForm();
  await expect(page.getByRole('status')).toContainText(`Created ${key} in staging`);
  await expect(row(page, key, 'staging')).toBeVisible();
  await expect(auditEntry(page, key, 'FLAG_CREATED')).toContainText(ACTOR);

  // The same key in the same environment is rejected by the backend (409) and shown inline.
  await fillForm();
  await expect(page.getByTestId('create-key-error')).toContainText('already exists');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();

  // Toggle a prod flag: UI updates, the audit feed records it, and the webhook arrives.
  const toggle = row(page, 'robotic-mower-ai-routing', 'prod').getByTestId('flag-toggle');
  const wasEnabled = (await toggle.getAttribute('aria-checked')) === 'true';
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', String(!wasEnabled));
  await expect(
    auditEntry(
      page,
      'robotic-mower-ai-routing',
      wasEnabled ? 'FLAG_DISABLED' : 'FLAG_ENABLED',
    ).first(),
  ).toContainText(ACTOR);

  // Delivered asynchronously by the outbox worker, so poll the mock receiver.
  await expect
    .poll(
      async () => {
        const res = await request.get(`${RECEIVER_URL}/events`);
        const { data } = (await res.json()) as { data: ReceivedWebhook[] };
        return data.some(
          (e) =>
            e.body.type === 'flag.toggled' &&
            e.body.data.actor === ACTOR &&
            e.body.data.flag.key === 'robotic-mower-ai-routing' &&
            e.body.data.flag.environment === 'prod' &&
            e.body.data.flag.enabled === !wasEnabled,
        );
      },
      { timeout: 20_000, message: 'webhook for the prod toggle should reach the receiver' },
    )
    .toBe(true);
});
