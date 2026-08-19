import { extractText, getDocumentProxy } from "unpdf";
import { StatementError } from "@/lib/statementImport";

/**
 * The text of a PDF, as the statement parser needs it.
 *
 * Layout is not preserved and does not need to be: the parser flattens the
 * whitespace anyway, because the extractor wraps company names and splits row
 * numbers across lines whatever it is asked for. What matters is that the
 * figures come out in reading order, which they do.
 */
export async function pdfText(bytes: Uint8Array): Promise<string> {
  try {
    const pdf = await getDocumentProxy(bytes);
    const { text } = await extractText(pdf, { mergePages: true });
    return text;
  } catch (err) {
    throw new StatementError(
      `PDF-г уншиж чадсангүй: ${(err as Error).message.slice(0, 120)}`,
    );
  }
}

/**
 * A ceiling on what one upload may weigh.
 *
 * These statements run to about 150KB for four years. Ten megabytes is far
 * more than any of them and still small enough that a request holding it in
 * memory cannot take the function down.
 */
export const MAX_PDF_BYTES = 10 * 1024 * 1024;

export function assertPdf(name: string, bytes: Uint8Array): void {
  if (bytes.byteLength === 0) {
    throw new StatementError(`${name}: файл хоосон байна.`);
  }
  if (bytes.byteLength > MAX_PDF_BYTES) {
    throw new StatementError(
      `${name}: файл хэт том байна (${Math.round(bytes.byteLength / 1024 / 1024)}MB).`,
    );
  }
  // "%PDF" — checked rather than trusting the name or the browser's type,
  // both of which the uploader chooses.
  const magic = String.fromCharCode(...bytes.slice(0, 4));
  if (magic !== "%PDF") {
    throw new StatementError(`${name}: PDF файл биш байна.`);
  }
}
