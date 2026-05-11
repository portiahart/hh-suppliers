import * as XLSX from 'xlsx';

function formatDateStr(raw: unknown): string {
  if (!raw) return '';
  if (raw instanceof Date) {
    const d = raw.getDate().toString().padStart(2, '0');
    const m = (raw.getMonth() + 1).toString().padStart(2, '0');
    return `${d}-${m}-${raw.getFullYear()}`;
  }
  if (typeof raw === 'string') {
    const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) return `${match[3]}-${match[2]}-${match[1]}`;
  }
  return String(raw ?? '');
}

function todayStr(): string {
  const now = new Date();
  const d = now.getDate().toString().padStart(2, '0');
  const m = (now.getMonth() + 1).toString().padStart(2, '0');
  return `${d}-${m}-${now.getFullYear()}`;
}

export interface ExportColumn<T> {
  header: string;
  field: keyof T | ((row: T) => unknown);
  type?: 'number' | 'date' | 'string';
}

export function exportTableToExcel<T>(
  data: T[],
  columns: ExportColumn<T>[],
  filename: string,
): void {
  const fullFilename = `${filename}_${todayStr()}.xlsx`;
  const headers = columns.map(c => c.header);
  const rows = data.map(row =>
    columns.map(col => {
      const raw = typeof col.field === 'function' ? col.field(row) : row[col.field];
      if (raw === null || raw === undefined || raw === '') return '';
      if (col.type === 'date') return formatDateStr(raw);
      if (col.type === 'number' || typeof raw === 'number') {
        return typeof raw === 'number' ? raw : parseFloat(String(raw)) || 0;
      }
      return String(raw);
    }),
  );
  const wsData = [headers, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Datos');
  XLSX.writeFile(wb, fullFilename);
}
