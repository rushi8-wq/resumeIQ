import { test, expect } from '@playwright/test';
import { docxFixture } from '../server/test/fixtures/documents.js';
import { matchingJob } from '../server/test/fixtures/matching.js';
test('consent, AI suggestions, edit/accept/reject/revert, preview and immutable version history', async ({
  page,
}) => {
  await page.goto('/register');
  await page.getByLabel('Full name').fill('Optimize Tester');
  await page
    .getByLabel('Email address')
    .fill(`optimize-${Date.now()}@example.com`);
  await page
    .getByLabel('Password', { exact: true })
    .fill('a secure optimization test password');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(
    page.getByRole('heading', { name: 'Welcome, Optimize.' }),
  ).toBeVisible();
  await page
    .getByRole('link', { name: 'My resumes', exact: true })
    .first()
    .click();
  await page.getByLabel('Resume file').setInputFiles({
    name: 'Optimization-resume.docx',
    mimeType:
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    buffer: await docxFixture(),
  });
  await expect(
    page.getByRole('heading', { name: 'Optimization-resume.docx' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Save corrections' }).click();
  await expect(page.getByRole('status')).toContainText('Corrections saved');
  await page.getByRole('link', { name: 'Analyze this saved resume' }).click();
  await page.getByLabel('Job title (optional)').fill('Full Stack Developer');
  await page.getByLabel('Job description', { exact: true }).fill(matchingJob);
  await page
    .getByRole('button', { name: 'Analyze Match', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Match analysis', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('link', { name: 'Open AI Optimization', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'AI Optimization', exact: true }),
  ).toBeVisible();
  const generate = page.getByRole('button', {
    name: 'Generate keyword suggestions',
    exact: true,
  });
  await expect(generate).toBeDisabled();
  await page
    .getByLabel(/I consent to sending the disclosed resume excerpts/)
    .check();
  const failureMessage =
    'Groq returned suggestions in an invalid format. No suggestions were saved. Please try again.';
  await page.route('**/api/ai/suggestions', (route) =>
    route.fulfill({
      status: 502,
      contentType: 'application/json',
      body: JSON.stringify({
        error: { code: 'AI_SCHEMA_INVALID', message: failureMessage },
      }),
    }),
  );
  await generate.click();
  await expect(page.getByRole('alert')).toHaveText(failureMessage);
  await expect(
    page.getByLabel(/I consent to sending the disclosed resume excerpts/),
  ).toBeChecked();
  await expect(page.locator('.suggestion-card')).toHaveCount(0);
  await page.unroute('**/api/ai/suggestions');
  await generate.click();
  await expect(page.locator('.suggestion-card')).toHaveCount(3);
  await expect(generate).toBeDisabled();
  const supported = page
    .locator('.suggestion-card')
    .filter({ hasText: 'Supported by evidence' });
  const gaps = page
    .locator('.suggestion-card')
    .filter({ hasText: 'Genuine skill gap' });
  await expect(
    gaps.first().getByRole('button', { name: 'Accept suggestion' }),
  ).toBeDisabled();
  await gaps.first().getByRole('button', { name: 'Reject suggestion' }).click();
  await expect(
    page.locator('.suggestion-card').filter({ hasText: 'rejected' }),
  ).toHaveCount(1);
  const current = page
    .locator('.suggestion-card')
    .filter({ hasText: 'Supported by evidence' });
  await current.getByRole('button', { name: 'Edit suggestion' }).click();
  const editor = current.getByLabel('Edited bullet');
  await expect(editor).toHaveValue(/Developed/);
  await editor.fill(
    (await editor.inputValue()).replace('Developed', 'Created'),
  );
  await current.getByRole('button', { name: 'Accept suggestion' }).click();
  await expect(
    page.locator('.suggestion-card').filter({ hasText: 'accepted' }),
  ).toHaveCount(1);
  await page
    .getByRole('button', { name: 'Recalculate preview', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Approve and save new version' }),
  ).toBeVisible();
  await expect(
    page.getByText('Optimized score', { exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Approve and save new version' })
    .click();
  await expect(
    page.getByText(
      'Optimized version saved. Your original resume is unchanged.',
      { exact: true },
    ),
  ).toBeVisible();
  await expect(page.locator('.saved-version')).toHaveCount(1);
  await page.reload();
  await expect(page.locator('.saved-version')).toHaveCount(1);
  await expect(
    page.locator('.suggestion-card').filter({ hasText: 'accepted' }),
  ).toHaveCount(1);
  for (const width of [320, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.screenshot({
    path: 'docs/screenshots/optimization.png',
    fullPage: true,
  });
  await page
    .locator('.suggestion-card')
    .filter({ hasText: 'Supported by evidence' })
    .getByRole('button', { name: 'Revert decision' })
    .click();
  await expect(
    page.locator('.suggestion-card').filter({ hasText: 'accepted' }),
  ).toHaveCount(0);
  await page
    .locator('.saved-version')
    .getByRole('button', { name: 'Delete version', exact: true })
    .click();
  await page.getByRole('button', { name: 'Confirm delete version' }).click();
  await expect(page.locator('.saved-version')).toHaveCount(0);
  await page
    .getByRole('link', { name: 'Original analysis', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Match analysis', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Delete analysis', exact: true })
    .click();
  await page.getByRole('button', { name: 'Confirm delete analysis' }).click();
  await page
    .getByRole('link', { name: 'My resumes', exact: true })
    .first()
    .click();
  await page.getByRole('link', { name: /Optimization-resume.docx/ }).click();
  await page
    .getByRole('button', { name: 'Delete resume', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Confirm delete', exact: true })
    .click();
});
