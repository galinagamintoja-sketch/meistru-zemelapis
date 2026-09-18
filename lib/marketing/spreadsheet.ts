import ExcelJS from "exceljs";
import { Readable } from "node:stream";
import type { ImportInputRow } from "./types";
import { textValue } from "./normalization";

export async function parseContactSpreadsheet(buffer: Buffer, fileName: string) {
  const workbook = new ExcelJS.Workbook();
  if (fileName.toLowerCase().endsWith(".csv")) await workbook.csv.read(Readable.from(buffer));
  else await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return { headers: [] as string[], rows: [] as ImportInputRow[] };
  const headerRow = sheet.getRow(1);
  const headers = headerRow.values instanceof Array
    ? headerRow.values.slice(1).map((value, index) => textValue(value) || `Column ${index + 1}`)
    : [];
  const rows: ImportInputRow[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const record: ImportInputRow = {};
    headers.forEach((header, index) => {
      const cell = row.getCell(index + 1);
      record[header] = cell.text || textValue(cell.value);
    });
    if (Object.values(record).some((value) => textValue(value))) rows.push(record);
  });
  return { headers, rows };
}
