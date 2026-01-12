import type { Participant } from "./types";

export const groupPriorityOrder = [
  "🐦‍🔥 Leitende / Ehemalige / Externe",
  "🔵 Jungpfadfinder*innen",
  "🟢 Pfadfinder*innen",
  "🟠 Wölflinge",
  "🔴 Rover",
];

const LEITER_GROUP = "🐦‍🔥 Leitende / Ehemalige / Externe";

function groupPriorityIndex(group: string): number {
  const idx = groupPriorityOrder.findIndex((g) => group?.includes(g));
  return idx === -1 ? groupPriorityOrder.length : idx;
}

function isLeiter(participant: Participant): boolean {
  return participant.Gruppen?.includes(LEITER_GROUP) ?? false;
}

function isSameGroup(a: Participant, b: Participant): boolean {
  return groupPriorityIndex(a.Gruppen) === groupPriorityIndex(b.Gruppen);
}

function hasSameLastName(a: Participant, b: Participant): boolean {
  return a.Nachname.toLowerCase() === b.Nachname.toLowerCase();
}

export type Direction = "Hinfahrt" | "Rückfahrt";

export interface CarAssignment {
  driver: Participant;
  seatsTotal: number;
  passengerCapacity: number;
  passengers: Participant[];
}

export interface PlanResult {
  direction: Direction;
  cars: CarAssignment[];
  leftovers: Participant[];
  demand: number;
  seatsAvailable: number;
}

export function computePlan(participants: Participant[], direction: Direction): PlanResult {
  const seatKey = direction === "Hinfahrt" ? "Hinfahrt" : "Rückfahrt";

  // Alle potentiellen Fahrer sammeln
  let potentialDrivers = participants
    .filter((p) => (p as any)[seatKey] > 0)
    .map((p) => ({ participant: p, seats: (p as any)[seatKey] as number }));

  // Riders = alle die mitfahren müssen (anfangs alle Teilnehmer)
  let allRiders = [...participants];

  // Finde Fahrer die nur 1 Passagierplatz haben und nur ihr eigenes Kind mitnehmen würden
  // Diese werden nicht als Fahrer eingeplant (außer Leiter)
  const driversToExclude: Set<string> = new Set();
  
  for (const { participant: driver, seats } of potentialDrivers) {
    // Leiter fahren immer
    if (isLeiter(driver)) continue;
    
    const passengerCapacity = Math.max(seats - 1, 0);
    
    // Nur bei genau 1 Passagierplatz prüfen
    if (passengerCapacity !== 1) continue;
    
    // Prüfen ob es ein Kind mit gleichem Nachnamen gibt (das eigene Kind)
    const ownChildren = allRiders.filter(
      (r) => hasSameLastName(driver, r) && 
             r !== driver && 
             !isLeiter(r) &&
             !(r.Vorname === driver.Vorname && r.Nachname === driver.Nachname)
    );
    
    // Wenn genau 1 eigenes Kind da ist, sollte der Fahrer nicht fahren
    // Das Kind kann bei jemand anderem mitfahren
    if (ownChildren.length === 1) {
      driversToExclude.add(`${driver.Vorname}|${driver.Nachname}`);
    }
  }

  // Fahrer filtern und sortieren
  const drivers = potentialDrivers
    .filter((d) => !driversToExclude.has(`${d.participant.Vorname}|${d.participant.Nachname}`))
    .sort((a, b) => {
      const pa = groupPriorityIndex(a.participant.Gruppen);
      const pb = groupPriorityIndex(b.participant.Gruppen);
      if (pa !== pb) return pa - pb;
      return b.seats - a.seats;
    });

  const riders = [...participants];
  const cars: CarAssignment[] = [];

  for (const { participant: driver, seats } of drivers) {
    // Fahrer aus Riders-Liste entfernen
    const riderIdx = riders.findIndex((r) => r.Vorname === driver.Vorname && r.Nachname === driver.Nachname);
    if (riderIdx !== -1) riders.splice(riderIdx, 1);

    const passengerCapacity = Math.max(seats - 1, 0);
    const passengers: Participant[] = [];

    // Passagiere auswählen: gleiche Stufe bevorzugen
    for (let i = 0; i < passengerCapacity && riders.length > 0; i++) {
      // Erst nach gleichem Gruppenindex suchen
      const sameGroupIdx = riders.findIndex((r) => isSameGroup(driver, r));
      
      if (sameGroupIdx !== -1) {
        // Passagier aus gleicher Stufe gefunden
        passengers.push(riders.splice(sameGroupIdx, 1)[0]);
      } else {
        // Keiner aus gleicher Stufe übrig -> nächsten verfügbaren nehmen
        passengers.push(riders.shift()!);
      }
    }

    cars.push({
      driver,
      seatsTotal: seats,
      passengerCapacity,
      passengers,
    });
  }

  const demand = participants.length; // jeder braucht einen Platz inkl. Fahrer
  const seatsAvailable = cars.reduce((sum, car) => sum + car.seatsTotal, 0);

  return {
    direction,
    cars,
    leftovers: riders,
    demand,
    seatsAvailable,
  };
}

export function planToCsv(plan: PlanResult): string {
  const header = "Richtung,Fahrer,Plätze,Mitfahrende";
  const rows = plan.cars.map((car) => {
    const name = `${car.driver.Vorname} ${car.driver.Nachname}`.trim();
    const passengers = car.passengers.map((p) => `${p.Vorname} ${p.Nachname}`.trim()).join(" | ");
    return [plan.direction, name, car.seatsTotal, passengers].join(",");
  });
  if (plan.leftovers.length) {
    const rest = plan.leftovers.map((p) => `${p.Vorname} ${p.Nachname}`).join(" | ");
    rows.push([plan.direction, "LEFTOVER", 0, rest].join(","));
  }
  return [header, ...rows].join("\n");
}
