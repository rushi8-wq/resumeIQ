import { test, expect } from '@playwright/test';
import { docxFixture, pdfFixture } from '../server/test/fixtures/documents.js';
test('upload, correct, persist, list and delete a private resume', async ({
  page,
}) => {
  await page.goto('/register');
  await page.getByLabel('Full name').fill('Resume Tester');
  await page
    .getByLabel('Email address')
    .fill(`resume-${Date.now()}@example.com`);
  await page
    .getByLabel('Password', { exact: true })
    .fill('a secure testing passphrase');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(
    page.getByRole('heading', { name: 'Welcome, Resume.' }),
  ).toBeVisible();
  await page
    .getByRole('link', { name: 'My resumes', exact: true })
    .first()
    .click();
  await expect(
    page.getByRole('heading', { name: 'My resumes', exact: true }),
  ).toBeVisible();
  await page
    .getByLabel('Resume file')
    .setInputFiles({
      name: 'invalid.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('fake document'),
    });
  await expect(page.getByRole('alert')).toContainText(
    'File content must match',
  );
  await page
    .getByLabel('Resume file')
    .setInputFiles({
      name: 'oversized.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.alloc(5 * 1024 * 1024 + 1),
    });
  await expect(page.getByRole('alert')).toContainText('5 MB');
  await page
    .getByLabel('Resume file')
    .setInputFiles({
      name: 'Alex-Morgan.docx',
      mimeType:
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      buffer: await docxFixture(),
    });
  await expect(
    page.getByRole('heading', { name: 'Alex-Morgan.docx', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('status')).toContainText(
    'Resume uploaded and parsed',
  );
  await expect(page.getByLabel('Full name')).toHaveValue('Alex Morgan');
  await expect(page.getByLabel('Skills', { exact: true })).toContainText(
    'React',
  );
  await page.getByLabel('Full name').fill('Alex Taylor');
  await page.getByLabel('Skills', { exact: true }).fill('ReactJS\nJS\nMongo');
  await page.getByRole('button', { name: 'Save corrections' }).click();
  await expect(page.getByRole('status')).toContainText('Corrections saved');
  await page.reload();
  await expect(page.getByLabel('Full name')).toHaveValue('Alex Taylor');
  await expect(page.getByLabel('Skills', { exact: true })).toHaveValue(
    'React\nJavaScript\nMongoDB',
  );
  for (const width of [320, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.screenshot({
    path: 'docs/screenshots/resume-preview.png',
    fullPage: true,
  });
  await page.getByRole('link', { name: 'Back to my resumes' }).click();
  await expect(
    page.getByRole('link', { name: /Alex-Morgan.docx/ }),
  ).toBeVisible();
  await page
    .getByRole('link', { name: 'Overview', exact: true })
    .first()
    .click();
  await expect(
    page.locator('.metrics > div').first().locator('strong'),
  ).toHaveText('1');
  await page
    .getByRole('link', { name: 'My resumes', exact: true })
    .first()
    .click();
  // Exercise drag-and-drop with a genuine PDF after the file-selection path above.
  const bytes = Array.from(await pdfFixture());
  const transfer = await page.evaluateHandle((data) => {
    const dt = new DataTransfer();
    dt.items.add(
      new File([new Uint8Array(data)], 'Dropped-resume.pdf', {
        type: 'application/pdf',
      }),
    );
    return dt;
  }, bytes);
  await page
    .locator('.drop-zone')
    .dispatchEvent('drop', { dataTransfer: transfer });
  await expect(
    page.getByRole('heading', { name: 'Dropped-resume.pdf', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Delete resume', exact: true })
    .click();
  await page.getByRole('button', { name: 'Confirm delete' }).click();
  await expect(
    page.getByRole('heading', { name: 'My resumes', exact: true }),
  ).toBeVisible();
  await page.getByRole('link', { name: /Alex-Morgan.docx/ }).click();
  await page
    .getByRole('button', { name: 'Delete resume', exact: true })
    .click();
  await page.getByRole('button', { name: 'Confirm delete' }).click();
  await expect(page.getByText('Your story starts here.')).toBeVisible();
});
