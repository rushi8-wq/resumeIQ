import { test, expect } from '@playwright/test';
import { docxFixture } from '../server/test/fixtures/documents.js';
import { matchingJob } from '../server/test/fixtures/matching.js';
test('saved resume to analysis, evidence, history, reload and deletion', async ({
  page,
}) => {
  await page.goto('/register');
  await page.getByLabel('Full name').fill('Match Tester');
  await page
    .getByLabel('Email address')
    .fill(`match-${Date.now()}@example.com`);
  await page
    .getByLabel('Password', { exact: true })
    .fill('a secure matching test passphrase');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(
    page.getByRole('heading', { name: 'Welcome, Match.' }),
  ).toBeVisible();
  await page
    .getByRole('link', { name: 'Job Match', exact: true })
    .first()
    .click();
  await expect(
    page.getByRole('heading', { name: 'Start with your resume.' }),
  ).toBeVisible();
  await page
    .getByRole('link', { name: 'Upload a resume', exact: true })
    .click();
  await page.getByLabel('Resume file').setInputFiles({
    name: 'Matching-resume.docx',
    mimeType:
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    buffer: await docxFixture(),
  });
  await expect(
    page.getByRole('heading', { name: 'Matching-resume.docx' }),
  ).toBeVisible();
  // Corrections remove skills from the saved profile, so the matcher must use current saved values.
  await page.getByLabel('Skills', { exact: true }).fill('ReactJS');
  await page
    .getByLabel('Projects', { exact: true })
    .fill('Built React applications.');
  await page.getByLabel('Work experience', { exact: true }).fill('');
  await page.getByLabel('Education', { exact: true }).fill('');
  await page.getByRole('button', { name: 'Save corrections' }).click();
  await expect(page.getByRole('status')).toContainText('Corrections saved');
  await page.getByRole('link', { name: 'Analyze this saved resume' }).click();
  await expect(page.getByLabel('Saved resume')).toHaveValue(/.+/);
  await page.getByLabel('Job title (optional)').fill('Full Stack Developer');
  await page.getByLabel('Company (optional)').fill('Example Studio');
  await page.getByLabel('Job description', { exact: true }).fill(matchingJob);
  await page
    .getByRole('button', { name: 'Analyze Match', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Match analysis', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Local TF-IDF fallback', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(
      'Your resume has several gaps relative to this job description. Review the AI Optimization workspace for evidence-based improvement suggestions.',
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Required skills', exact: true }),
  ).toBeVisible();
  await expect(
    page.locator('.missing-skill').filter({ hasText: 'Docker' }),
  ).toBeVisible();
  await expect(
    page.locator('.missing-skill').filter({ hasText: 'Node.js' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Relevant projects', exact: true }),
  ).toBeVisible();
  const score = await page.locator('.score-precision').innerText();
  await page.reload();
  await expect(page.locator('.score-precision')).toHaveText(score);
  for (const width of [320, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.screenshot({
    path: 'docs/screenshots/match-analysis.png',
    fullPage: true,
  });
  await page
    .getByRole('link', { name: 'History', exact: true })
    .first()
    .click();
  await expect(
    page.getByRole('heading', { name: 'Analysis history', exact: true }),
  ).toBeVisible();
  await page.getByRole('link', { name: /Full Stack Developer/ }).click();
  await expect(page.locator('.score-precision')).toHaveText(score);
  await page
    .getByRole('button', { name: 'Delete analysis', exact: true })
    .click();
  await page.getByRole('button', { name: 'Confirm delete analysis' }).click();
  await expect(
    page.getByRole('heading', { name: 'No analyses yet' }),
  ).toBeVisible();
  await page
    .getByRole('link', { name: 'My resumes', exact: true })
    .first()
    .click();
  await page.getByRole('link', { name: /Matching-resume.docx/ }).click();
  await page
    .getByRole('button', { name: 'Delete resume', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Confirm delete', exact: true })
    .click();
  await expect(page.getByText('Your story starts here.')).toBeVisible();
});
