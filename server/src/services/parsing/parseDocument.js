import { Worker } from 'node:worker_threads';
import { HttpError } from '../../middleware/errors.js';
export const MAX_FILE_SIZE = 5 * 1024 * 1024;
export function inspectFile(buffer, filename) {
  if (!buffer?.length)
    throw new HttpError(400, 'Choose a non-empty PDF or DOCX resume.');
  if (buffer.length > MAX_FILE_SIZE)
    throw new HttpError(413, 'Resume files must be 5 MB or smaller.');
  const extension = filename?.split('.').pop()?.toLowerCase();
  const pdf = buffer.subarray(0, 5).toString() === '%PDF-';
  const zip = buffer
    .subarray(0, 4)
    .equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  if ((extension === 'pdf' && pdf) || (extension === 'docx' && zip))
    return extension;
  throw new HttpError(
    415,
    'File content must match a supported PDF or DOCX document.',
  );
}
export async function parseDocument(buffer, fileType) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./documentWorker.js', import.meta.url), {
      workerData: { buffer, fileType },
      stdout: true,
      stderr: true,
      resourceLimits: {
        maxOldGenerationSizeMb: 128,
        maxYoungGenerationSizeMb: 32,
      },
    });
    // Discard parser diagnostics, which may include private document fragments.
    worker.stdout.resume();
    worker.stderr.resume();
    let settled = false;
    function finish(error, result) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      worker.terminate();
      if (error) reject(error);
      else resolve(result);
    }
    const unavailable = () =>
      new HttpError(
        422,
        'This document could not be read. It may be malformed, encrypted, or exceed parsing limits. Export a new text-based PDF or DOCX and try again.',
      );
    const timer = setTimeout(
      () =>
        finish(
          new HttpError(
            422,
            'Document parsing timed out. Try a simpler text-based PDF or DOCX.',
          ),
        ),
      15000,
    );
    worker.once('message', (message) =>
      message.ok ? finish(null, message.result) : finish(unavailable()),
    );
    worker.once('error', () => finish(unavailable()));
    worker.once('exit', () => {
      if (!settled) finish(unavailable());
    });
  });
}
