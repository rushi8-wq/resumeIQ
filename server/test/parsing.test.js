import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractStructured,
  extractSkills,
  normalizeSkills,
} from '../src/services/parsing/structured.js';
import {
  inspectFile,
  parseDocument,
  MAX_FILE_SIZE,
} from '../src/services/parsing/parseDocument.js';
import { pdfFixture, docxFixture, resumeText } from './fixtures/documents.js';
test('technology aliases normalize and deduplicate without substring matches', () => {
  assert.deepEqual(
    normalizeSkills(['ReactJS', 'React', 'JS', 'Node', 'Mongo', 'Terraform']),
    ['React', 'JavaScript', 'Node.js', 'MongoDB', 'Terraform'],
  );
  assert.deepEqual(extractSkills('JavaScript, C++, C#, .NET, PostgreSQL'), [
    'JavaScript',
    'C++',
    'C#',
    '.NET',
    'PostgreSQL',
  ]);
  assert.deepEqual(
    extractSkills('expression target reactively mongoose node_modules'),
    [],
  );
});
test('extracts only explicit identity, sections, and skills', () => {
  const { structuredData: d, warnings } = extractStructured(resumeText);
  assert.equal(d.name, 'Alex Morgan');
  assert.equal(d.email, 'alex@example.com');
  for (const key of [
    'education',
    'skills',
    'projects',
    'workExperience',
    'certifications',
    'achievements',
  ])
    assert.ok(d[key].length, key);
  assert.ok(d.skills.includes('React'));
  assert.ok(d.skills.includes('JavaScript'));
  assert.ok(!d.skills.includes('AWS'));
  assert.deepEqual(warnings, []);
  assert.equal(
    d.workExperience[0],
    'Software Intern - Example Studio, June 2023 - August 2023',
  );
});
test('sparse and ambiguous resumes leave absent facts empty and return review warnings', () => {
  const {
    structuredData: d,
    warnings,
    parsingStatus,
  } = extractStructured(
    'Software Engineer\nSkills: ReactJS\nSummary\nInterested in new opportunities',
  );
  assert.equal(d.name, '');
  assert.equal(d.email, '');
  assert.deepEqual(d.education, []);
  assert.deepEqual(d.skills, ['React']);
  assert.equal(parsingStatus, 'needs_review');
  assert.ok(warnings.length);
  assert.deepEqual(extractStructured('').structuredData.projects, []);
  assert.match(extractStructured('').warnings[0], /OCR/);
});
test('Unicode names, CRLF, inline headings, and missing sections are handled', () => {
  const { structuredData: d } = extractStructured(
    'José García\r\njose@example.com\r\nSkills: JS, ReactJS\r\nProjects: Built a personal website',
  );
  assert.equal(d.name, 'José García');
  assert.deepEqual(d.projects, ['Built a personal website']);
  assert.ok(d.skills.includes('JavaScript'));
});
test('signature inspection requires actual bytes and matching extensions', () => {
  assert.equal(inspectFile(Buffer.from('%PDF-1.7 test'), 'Resume.PDF'), 'pdf');
  assert.throws(() => inspectFile(Buffer.from('fake pdf'), 'resume.pdf'), {
    status: 415,
  });
  assert.throws(() => inspectFile(Buffer.from('%PDF-1.7'), 'resume.docx'), {
    status: 415,
  });
  assert.throws(() => inspectFile(Buffer.alloc(0), 'resume.pdf'), {
    status: 400,
  });
  assert.throws(
    () => inspectFile(Buffer.alloc(MAX_FILE_SIZE + 1), 'resume.pdf'),
    { status: 413 },
  );
});
test('real PDF and DOCX extraction preserves text and structured fields', async () => {
  for (const [type, buffer] of [
    ['pdf', await pdfFixture()],
    ['docx', await docxFixture()],
  ]) {
    const result = await parseDocument(buffer, type);
    assert.match(result.extractedText, /Alex Morgan/);
    assert.equal(result.structuredData.email, 'alex@example.com');
    assert.ok(result.structuredData.skills.includes('React'));
    assert.equal(result.parsingStatus, 'parsed');
  }
});
test('a valid image-only/blank PDF returns an actionable OCR warning', async () => {
  const result = await parseDocument(await pdfFixture(''), 'pdf');
  assert.equal(result.parsingStatus, 'needs_review');
  assert.match(result.warnings.join(' '), /OCR/);
  assert.equal(result.structuredData.name, '');
});
test('malformed, non-DOCX ZIP, and dangerous expanded documents are rejected safely', async () => {
  const invalidDocx = await docxFixture(resumeText, {
    '[Content_Types].xml': '<Types/>',
    'word/document.xml': '<not-a-document/>',
  });
  for (const [type, buffer] of [
    ['pdf', Buffer.from('%PDF-broken private resume content')],
    ['docx', Buffer.from('PK\x03\x04broken')],
    ['docx', invalidDocx],
    [
      'docx',
      await docxFixture(resumeText, {
        'word/document.xml':
          '<w:document xmlns:w="urn:test"><w:p></w:document>',
      }),
    ],
    [
      'docx',
      await docxFixture(resumeText, {
        'word/huge.xml': 'x'.repeat(21 * 1024 * 1024),
      }),
    ],
    ['docx', await docxFixture(resumeText, { 'word/vbaProject.bin': 'macro' })],
  ]) {
    await assert.rejects(
      parseDocument(buffer, type),
      (error) =>
        error.status === 422 &&
        !error.message.includes('private resume content'),
    );
  }
});
