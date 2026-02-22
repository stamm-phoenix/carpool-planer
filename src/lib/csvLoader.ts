import type { Participant } from "./types";

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current);
  return values.map((v) => v.trim());
}

export function parseCsv(raw: string): Participant[] {
  const lines = raw.trim().split(/\r?\n/);
  const [, ...rows] = lines;

  return rows
    .map((line) => parseCsvLine(line))
    .filter((cols) => cols.length >= 5)
    .map(([Vorname, Nachname, Gruppen, Hinfahrt, Rückfahrt]) => ({
      Vorname,
      Nachname,
      Gruppen,
      Hinfahrt: Number(Hinfahrt ?? 0),
      Rückfahrt: Number(Rückfahrt ?? 0),
    }));
}
