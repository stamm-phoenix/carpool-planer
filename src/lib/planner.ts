import type { Participant } from "./types";

export const groupPriorityOrder = [
  "🐦‍🔥 Leitende / Ehemalige / Externe",
  "🔵 Jungpfadfinder*innen",
  "🟢 Pfadfinder*innen",
  "🟠 Wölflinge",
  "🔴 Rover",
];

function groupPriorityIndex(group: string): number {
  const idx = groupPriorityOrder.findIndex((g) => group?.includes(g));
  return idx === -1 ? groupPriorityOrder.length : idx;
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

  const drivers = participants
    .filter((p) => (p as any)[seatKey] > 0)
    .map((p) => ({ participant: p, seats: (p as any)[seatKey] as number }))
    .sort((a, b) => {
      const pa = groupPriorityIndex(a.participant.Gruppen);
      const pb = groupPriorityIndex(b.participant.Gruppen);
      if (pa !== pb) return pa - pb;
      return b.seats - a.seats;
    });

  const riders = [...participants];
  const cars: CarAssignment[] = [];

  for (const { participant: driver, seats } of drivers) {
    // remove driver from riders list
    const riderIdx = riders.findIndex((r) => r.Vorname === driver.Vorname && r.Nachname === driver.Nachname);
    if (riderIdx !== -1) riders.splice(riderIdx, 1);

    const passengerCapacity = Math.max(seats - 1, 0);
    const passengers: Participant[] = riders.splice(0, passengerCapacity);

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
