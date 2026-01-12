import type { Participant } from "./types";

export function parseCsv(raw: string): Participant[] {
  const lines = raw.trim().split(/\r?\n/);
  const [, ...rows] = lines;
  return rows
    .map((line) => line.replace(/^"|"$/g, ""))
    .map((line) => line.split(/","/))
    .filter((cols) => cols.length >= 5)
    .map(([Vorname, Nachname, Gruppen, Hinfahrt, Rückfahrt]) => ({
      Vorname,
      Nachname,
      Gruppen,
      Hinfahrt: Number(Hinfahrt ?? 0),
      Rückfahrt: Number(Rückfahrt ?? 0),
    }));
}
