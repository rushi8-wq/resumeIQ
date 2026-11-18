import { test, expect } from '@playwright/test';
import { docxFixture } from '../server/test/fixtures/documents.js';
test('job recommendations, filters, details and private bookmarks using explicit provider fixtures', async ({
  page,
}) => {
  await page.goto('/register');
  await page.getByLabel('Full name').fill('Discovery Tester');
  await page
    .getByLabel('Email address')
    .fill(`discovery-${Date.now()}@example.com`);
  await page
    .getByLabel('Password', { exact: true })
    .fill('secure discovery testing password');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(
    page.getByRole('heading', { name: 'Welcome, Discovery.' }),
  ).toBeVisible();
  await page
    .getByRole('link', { name: 'My resumes', exact: true })
    .first()
    .click();
  await page.getByLabel('Resume file').setInputFiles({
    name: 'Discovery-resume.docx',
    mimeType:
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    buffer: await docxFixture(),
  });
  await expect(
    page.getByRole('heading', { name: 'Discovery-resume.docx' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Save corrections' }).click();
  await expect(page.getByRole('status')).toContainText('Corrections saved');
  await page
    .getByRole('link', { name: 'Job discovery', exact: true })
    .first()
    .click();
  await page
    .getByRole('combobox', { name: 'Saved resume', exact: true })
    .selectOption({ label: 'Discovery-resume.docx' });
  await page.getByRole('button', { name: 'Search jobs', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: /Recommended for you/ }),
  ).toBeVisible();
  await expect(page.getByRole('status')).toContainText(
    'Automated-test fixtures',
  );
  await expect(page.locator('.job-card')).toHaveCount(2);
  await expect(page.locator('.job-card').first()).toContainText(
    'Full Stack Developer',
  );
  await expect(page.locator('.job-score').first()).toContainText('%');
  await page.getByLabel('Location', { exact: true }).fill('India');
  await page.getByRole('button', { name: 'Search jobs', exact: true }).click();
  await expect(page.locator('.job-card')).toHaveCount(1);
  await expect(page.locator('.job-card')).toContainText('Marketing Manager');
  await page.getByLabel('Location', { exact: true }).fill('');
  await page.getByRole('button', { name: 'Search jobs', exact: true }).click();
  await expect(page.locator('.job-card')).toHaveCount(2);
  for (const width of [320, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.screenshot({
    path: 'docs/screenshots/job-discovery-fixture.png',
    fullPage: true,
  });
  await page
    .locator('.job-card')
    .first()
    .getByRole('button', { name: 'Save job', exact: true })
    .click();
  await expect(
    page
      .locator('.job-card')
      .first()
      .getByRole('button', { name: 'Unsave job' }),
  ).toBeVisible();
  await page
    .locator('.job-card')
    .first()
    .getByRole('link', { name: 'View details' })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Full description' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Score details' }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: /Apply externally/ }),
  ).toHaveAttribute('href', /https:\/\/jobicy.com\/jobs\//);
  await page
    .getByRole('link', { name: 'Saved jobs', exact: true })
    .first()
    .click();
  await expect(page.locator('.job-card')).toHaveCount(1);
  await page.reload();
  await expect(page.locator('.job-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'Remove saved job' }).click();
  await expect(page.locator('.job-card')).toHaveCount(0);
  await expect(page.getByText(/No saved jobs yet/)).toBeVisible();
});
