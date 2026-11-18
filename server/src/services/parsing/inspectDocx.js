import yauzl from 'yauzl';
import { SaxesParser } from 'saxes';
const MAX_EXPANDED = 20 * 1024 * 1024;
// Validate archive structure and actual expanded bytes before Mammoth sees the input.
export function inspectDocx(buffer) {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(
      buffer,
      { lazyEntries: true, validateEntrySizes: true },
      (error, zip) => {
        if (error) return reject(error);
        let total = 0,
          count = 0;
        const names = new Set();
        const xml = {};
        let settled = false;
        const fail = (err) => {
          if (!settled) {
            settled = true;
            zip.close();
            reject(err);
          }
        };
        zip.on('error', fail);
        zip.on('entry', (entry) => {
          if (
            ++count > 500 ||
            names.has(entry.fileName) ||
            entry.generalPurposeBitFlag & 1 ||
            /vbaProject\.bin$/i.test(entry.fileName)
          )
            return fail(new Error('Unsupported archive'));
          names.add(entry.fileName);
          if (
            entry.uncompressedSize > MAX_EXPANDED ||
            total + entry.uncompressedSize > MAX_EXPANDED
          )
            return fail(new Error('Expanded document too large'));
          if (entry.fileName.endsWith('/')) return zip.readEntry();
          zip.openReadStream(entry, (err, stream) => {
            if (err) return fail(err);
            const capture = /\.(xml|rels)$/i.test(entry.fileName);
            const chunks = [];
            let entryBytes = 0;
            stream.on('error', fail);
            stream.on('data', (chunk) => {
              total += chunk.length;
              entryBytes += chunk.length;
              if (
                total > MAX_EXPANDED ||
                (capture && entryBytes > 4 * 1024 * 1024)
              ) {
                stream.destroy();
                fail(new Error('Document content too large'));
                return;
              }
              if (capture) chunks.push(chunk);
            });
            stream.on('end', () => {
              if (settled) return;
              if (capture) {
                try {
                  const content = Buffer.concat(chunks).toString('utf8');
                  if (/<!DOCTYPE|<!ENTITY/i.test(content))
                    throw new Error('Unsupported XML declarations');
                  new SaxesParser({ xmlns: true }).write(content).close();
                  if (
                    ['[Content_Types].xml', 'word/document.xml'].includes(
                      entry.fileName,
                    )
                  )
                    xml[entry.fileName] = content;
                } catch (error) {
                  fail(error);
                  return;
                }
              }
              zip.readEntry();
            });
          });
        });
        zip.on('end', () => {
          if (settled) return;
          if (
            !xml['[Content_Types].xml']?.includes(
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml',
            ) ||
            !/<(?:\w+:)?document[\s>]/.test(xml['word/document.xml'] || '')
          )
            return fail(new Error('Not a DOCX document'));
          if (Object.values(xml).some((s) => /<!DOCTYPE|<!ENTITY/i.test(s)))
            return fail(new Error('Unsupported XML declarations'));
          settled = true;
          resolve();
        });
        zip.readEntry();
      },
    );
  });
}
