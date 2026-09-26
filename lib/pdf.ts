import PDFDocument from "pdfkit";

/**
 * Centralized PDF generation (spec §24). All PDFs go through here —
 * never scatter PDFDocument usage across routes.
 */
export function generatePdf(input: {
  title: string;
  subtitle?: string;
  rows?: string[][];
  columns?: string[];
  lines?: string[];
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40 });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(18).text(input.title);
    if (input.subtitle) {
      doc.moveDown(0.3).fontSize(10).fillColor("#666").text(input.subtitle);
    }
    doc.moveDown().fillColor("#000");

    if (input.lines) {
      for (const line of input.lines) {
        doc.fontSize(11).text(line);
      }
    }

    if (input.columns && input.rows) {
      doc.moveDown(0.5);
      doc.fontSize(10).font("Helvetica-Bold");
      doc.text(input.columns.join("  |  "));
      doc.font("Helvetica").moveDown(0.2);
      for (const row of input.rows) {
        doc.text(row.join("  |  "));
      }
    }
    doc.end();
  });
}
