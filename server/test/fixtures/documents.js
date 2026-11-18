import { PDFDocument, StandardFonts } from 'pdf-lib';
import JSZip from 'jszip';
export const resumeText = `Alex Morgan
alex@example.com
Technical Skills
ReactJS, JS, Node, Mongo, Docker, C++, C#, .NET
Education
B.Sc. Computer Science - Example University, 2022
Projects
Resume Tracker - Built a ReactJS dashboard using Node and Mongo.
Work Experience
Software Intern - Example Studio, June 2023 - August 2023
Built REST APIs for the project dashboard.
Certifications
Example Cloud Fundamentals Certificate
Achievements
Won the university project showcase.`;
export async function pdfFixture(text = resumeText) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  text
    .split('\n')
    .forEach((line, i) =>
      page.drawText(line, { x: 40, y: 750 - i * 24, font, size: 10 }),
    );
  return Buffer.from(await doc.save());
}
const escape = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export async function docxFixture(text = resumeText, extras = {}) {
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  );
  zip.file(
    '_rels/.rels',
    '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  );
  zip.file(
    'word/document.xml',
    `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${text
      .split('\n')
      .map(
        (line) =>
          `<w:p><w:r><w:t xml:space="preserve">${escape(line)}</w:t></w:r></w:p>`,
      )
      .join('')}<w:sectPr/></w:body></w:document>`,
  );
  for (const [name, value] of Object.entries(extras)) zip.file(name, value);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}
