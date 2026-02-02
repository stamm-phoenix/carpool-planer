import type { Participant } from "./types";

/**
 * Priority tiers for driver selection:
 * - Tier 0: Leitende (highest priority, use ALL their seats)
 * - Tier 1: Rover
 * - Tier 2: Jupfis, Pfadis, Wölflinge (equal priority)
 * 
 * Within each tier, drivers with more seats are used first (fill cars completely).
 */

// Display order for UI (not the same as priority!)
export const groupPriorityOrder = [
  "Leitende",
  "Rover",
  "Jungpfadfinder*innen",
  "Pfadfinder*innen",
  "Wölflinge",
];

// Group name patterns for matching
const GROUP_PATTERNS = {
  leiter: ["leitend", "externe", "ehemalige"],
  rover: ["rover"],
  jupfi: ["jungpfadfinder"],
  pfadi: ["pfadfinder"],
  woelflinge: ["wölflinge", "wölfling", "woelfling"],
} as const;

/**
 * Get the priority tier for a participant's group.
 * Lower number = higher priority.
 * Tier 0: Leitende (always drive first, use all seats)
 * Tier 1: Rover
 * Tier 2: Jupfis, Pfadis, Wölflinge (equal)
 */
function getPriorityTier(group: string): number {
  const g = group?.toLowerCase() ?? "";
  
  // Tier 0: Leitende / Ehemalige / Externe
  if (GROUP_PATTERNS.leiter.some((p) => g.includes(p))) return 0;
  
  // Tier 1: Rover
  if (GROUP_PATTERNS.rover.some((p) => g.includes(p))) return 1;
  
  // Tier 2: Jupfis, Pfadis, Wölflinge (equal priority)
  if (GROUP_PATTERNS.jupfi.some((p) => g.includes(p))) return 2;
  if (GROUP_PATTERNS.pfadi.some((p) => g.includes(p))) return 2;
  if (GROUP_PATTERNS.woelflinge.some((p) => g.includes(p))) return 2;
  
  // Unknown groups get lowest priority
  return 3;
}

/**
 * Get a display-friendly group category
 */
export function getGroupCategory(group: string): string {
  const g = group?.toLowerCase() ?? "";
  
  if (GROUP_PATTERNS.leiter.some((p) => g.includes(p))) return "Leitende";
  if (GROUP_PATTERNS.rover.some((p) => g.includes(p))) return "Rover";
  if (GROUP_PATTERNS.jupfi.some((p) => g.includes(p))) return "Jungpfadfinder*innen";
  if (GROUP_PATTERNS.pfadi.some((p) => g.includes(p))) return "Pfadfinder*innen";
  if (GROUP_PATTERNS.woelflinge.some((p) => g.includes(p))) return "Wölflinge";
  
  return group || "Unbekannt";
}

function isLeiter(participant: Participant): boolean {
  return getPriorityTier(participant.Gruppen) === 0;
}

function isSameTier(a: Participant, b: Participant): boolean {
  return getPriorityTier(a.Gruppen) === getPriorityTier(b.Gruppen);
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

  // Fahrer filtern und sortieren nach Prioritätstier, dann nach Sitzplätzen (meiste zuerst)
  const drivers = potentialDrivers
    .filter((d) => !driversToExclude.has(`${d.participant.Vorname}|${d.participant.Nachname}`))
    .sort((a, b) => {
      const tierA = getPriorityTier(a.participant.Gruppen);
      const tierB = getPriorityTier(b.participant.Gruppen);
      // First sort by tier (lower = higher priority)
      if (tierA !== tierB) return tierA - tierB;
      // Within same tier, sort by seats descending (fill bigger cars first)
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
      // Erst nach gleichem Tier suchen
      const sameTierIdx = riders.findIndex((r) => isSameTier(driver, r));
      
      if (sameTierIdx !== -1) {
        // Passagier aus gleichem Tier gefunden
        passengers.push(riders.splice(sameTierIdx, 1)[0]);
      } else {
        // Keiner aus gleichem Tier übrig -> nächsten verfügbaren nehmen
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
