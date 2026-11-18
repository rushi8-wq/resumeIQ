import { parentPort, workerData } from 'node:worker_threads';
import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';
import { inspectDocx } from './inspectDocx.js';
import { extractStructured } from './structured.js';
try {
  const buffer = Buffer.from(workerData.buffer);
  let text = '';
  if (workerData.fileType === 'docx') {
    await inspectDocx(buffer);
    text = (await mammoth.extractRawText({ buffer })).value;
  } else {
    const parser = new PDFParse({
      data: new Uint8Array(buffer),
      verbosity: 0,
      isEvalSupported: false,
    });
    try {
      const info = await parser.getInfo();
      if (info.total > 100) throw new Error('Too many pages');
      text = (await parser.getText({ pageJoiner: '' })).text;
    } finally {
      await parser.destroy();
    }
  }
  text = text
    .replace(/\u0000/g, '')
    .replace(/\r\n?/g, '\n')
    .trim();
  if (text.length > 100000) throw new Error('Too much text');
  parentPort.postMessage({
    ok: true,
    result: { extractedText: text, ...extractStructured(text) },
  });
} catch {
  // Never forward parser exceptions: they may contain document content.
  parentPort.postMessage({ ok: false });
}
