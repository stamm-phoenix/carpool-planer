import type { Participant } from "./types";

/**
 * Priority tiers for driver selection:
 * - Tier 0: Leitende (highest priority, always drive when seats > 0)
 * - Tier 1: Rover
 * - Tier 2: Jupfis, Pfadis, Wölflinge (equal priority)
 *
 * Within each tier, drivers with more seats are preferred.
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
 */
function getPriorityTier(group: string): number {
  const g = group?.toLowerCase() ?? "";

  if (GROUP_PATTERNS.leiter.some((p) => g.includes(p))) return 0;
  if (GROUP_PATTERNS.rover.some((p) => g.includes(p))) return 1;
  if (GROUP_PATTERNS.jupfi.some((p) => g.includes(p))) return 2;
  if (GROUP_PATTERNS.pfadi.some((p) => g.includes(p))) return 2;
  if (GROUP_PATTERNS.woelflinge.some((p) => g.includes(p))) return 2;

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

export function isLeiter(participant: Participant): boolean {
  return getPriorityTier(participant.Gruppen) === 0;
}

function getSurname(p: Participant): string {
  return (p.Nachname ?? "").trim().toLowerCase();
}

function surnameCounts(passengers: Participant[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const p of passengers) {
    const surname = getSurname(p);
    if (!surname) continue;
    counts.set(surname, (counts.get(surname) ?? 0) + 1);
  }
  return counts;
}

function pickBestPassenger(
  driver: Participant,
  remaining: Participant[],
  inCar: Participant[],
  preferLeiterForLeiterDriver: boolean,
): Participant | undefined {
  if (remaining.length === 0) return undefined;

  const driverSurname = getSurname(driver);
  const inCarSurnames = new Set(inCar.map(getSurname).filter(Boolean));
  const counts = surnameCounts(remaining);
  const driverTier = getPriorityTier(driver.Gruppen);
  const inCarTierCounts = new Map<number, number>();
  for (const passenger of inCar) {
    const tier = getPriorityTier(passenger.Gruppen);
    inCarTierCounts.set(tier, (inCarTierCounts.get(tier) ?? 0) + 1);
  }

  let dominantInCarTier: number | null = null;
  let dominantInCarTierCount = 0;
  for (const [tier, count] of inCarTierCounts) {
    if (count > dominantInCarTierCount) {
      dominantInCarTier = tier;
      dominantInCarTierCount = count;
    }
  }

  let bestIndex = -1;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (let i = 0; i < remaining.length; i += 1) {
    const candidate = remaining[i];
    const candidateSurname = getSurname(candidate);
    const familyCount = candidateSurname ? (counts.get(candidateSurname) ?? 0) : 0;
    const candidateTier = getPriorityTier(candidate.Gruppen);

    let score = 0;

    if (preferLeiterForLeiterDriver && isLeiter(candidate)) score += 40;
    if (candidateTier === driverTier) score += 50;
    else score -= 12;

    if (dominantInCarTier !== null) {
      if (dominantInCarTier === driverTier) {
        if (candidateTier === dominantInCarTier) score += 12;
      } else if (candidateTier === dominantInCarTier) {
        score += 4;
      }
    }

    if (candidateSurname && (inCarSurnames.has(candidateSurname) || candidateSurname === driverSurname)) {
      score += 50;
    }

    if (candidateSurname && familyCount > 1) {
      score += inCar.length === 0 ? 18 : 10;
    }

    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }

  if (bestIndex === -1) return undefined;
  return remaining.splice(bestIndex, 1)[0];
}

/**
 * Create a unique key for a participant (for deduplication)
 */
export function participantKey(p: Participant): string {
  if (p.id) return p.id;
  return `${p.Vorname}|${p.Nachname}|${p.Gruppen}`;
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
  unassignedPassengers: Participant[];
  demand: number;
  seatsAvailable: number;
}

type DriverCandidate = { participant: Participant; seats: number; passengerCapacity: number };

function rebalanceSparseCars(cars: CarAssignment[]): void {
  if (cars.length < 2) return;

  while (true) {
    const sourceIndex = cars.findIndex((car) => car.passengers.length === 1);
    if (sourceIndex === -1) break;

    const source = cars[sourceIndex];
    const passenger = source.passengers[0];
    if (!passenger) break;

    let bestTargetIndex = -1;
    let bestTargetLoad = -1;

    for (let i = 0; i < cars.length; i += 1) {
      if (i === sourceIndex) continue;
      const target = cars[i];
      const targetHasSpace = target.passengers.length < target.passengerCapacity;
      if (!targetHasSpace) continue;
      if (target.passengers.length === 0) continue;

      if (target.passengers.length > bestTargetLoad) {
        bestTargetLoad = target.passengers.length;
        bestTargetIndex = i;
      }
    }

    if (bestTargetIndex === -1) break;

    source.passengers.pop();
    cars[bestTargetIndex].passengers.push(passenger);
  }
}

function sortDriverCandidates(a: DriverCandidate, b: DriverCandidate): number {
  if (b.passengerCapacity !== a.passengerCapacity) return b.passengerCapacity - a.passengerCapacity;
  const tierDiff = getPriorityTier(a.participant.Gruppen) - getPriorityTier(b.participant.Gruppen);
  if (tierDiff !== 0) return tierDiff;
  return b.seats - a.seats;
}

/**
 * Main planning function with smart driver selection:
 *
 * Key rules:
 * 1. As few drivers as possible are selected.
 * 2. Driver selection prefers larger cars first, then group priority.
 * 3. Every participant appears in exactly one place: driver, passenger, or unassigned.
 */
export function computePlan(
  participants: Participant[],
  direction: Direction,
  forcedDriverKeys: Iterable<string> = [],
  excludedParticipantKeys: Iterable<string> = [],
): PlanResult {
  const seatKey = direction === "Hinfahrt" ? "Hinfahrt" : "Rückfahrt";
  const forcedKeys = new Set(forcedDriverKeys);
  const excludedKeys = new Set(excludedParticipantKeys);
  const activeParticipants = participants.filter((participant) => !excludedKeys.has(participantKey(participant)));

  const driverCandidates: DriverCandidate[] = [];

  for (const p of activeParticipants) {
    const seats = p[seatKey] as number;
    if (seats > 0) {
      driverCandidates.push({
        participant: p,
        seats,
        passengerCapacity: Math.max(seats - 1, 0),
      });
    }
  }

  driverCandidates.sort(sortDriverCandidates);

  const forcedCandidates = driverCandidates.filter((candidate) =>
    forcedKeys.has(participantKey(candidate.participant)),
  );
  const optionalCandidates = driverCandidates.filter(
    (candidate) => !forcedKeys.has(participantKey(candidate.participant)),
  );

  const selectedDrivers: DriverCandidate[] = [];
  let selectedSeatTotal = 0;
  for (const candidate of forcedCandidates) {
    selectedDrivers.push(candidate);
    selectedSeatTotal += candidate.seats;
  }

  for (const candidate of optionalCandidates) {
    if (selectedSeatTotal >= activeParticipants.length) break;
    selectedDrivers.push(candidate);
    selectedSeatTotal += candidate.seats;
  }

  const selectedDriverKeys = new Set(selectedDrivers.map((candidate) => participantKey(candidate.participant)));
  const remainingPassengers = activeParticipants.filter(
    (participant) => !selectedDriverKeys.has(participantKey(participant)),
  );

  const cars: CarAssignment[] = [];
  for (const { participant: driver, seats, passengerCapacity } of selectedDrivers) {
    const passengers: Participant[] = [];
    while (passengers.length < passengerCapacity && remainingPassengers.length > 0) {
      const picked = pickBestPassenger(driver, remainingPassengers, passengers, true);
      if (!picked) break;
      passengers.push(picked);
    }

    cars.push({
      driver,
      seatsTotal: seats,
      passengerCapacity,
      passengers,
    });
  }

  rebalanceSparseCars(cars);

  const unassignedPassengers = [...remainingPassengers];
  const demand = activeParticipants.length - selectedDrivers.length;
  const seatsAvailable = cars.reduce((sum, car) => sum + car.passengerCapacity, 0);

  const representedKeys = new Set<string>();
  for (const car of cars) {
    representedKeys.add(participantKey(car.driver));
    for (const p of car.passengers) {
      representedKeys.add(participantKey(p));
    }
  }
  for (const p of unassignedPassengers) {
    representedKeys.add(participantKey(p));
  }

  for (const p of activeParticipants) {
    if (!representedKeys.has(participantKey(p))) {
      console.error(`BUG: Participant ${p.Vorname} ${p.Nachname} is not represented in the plan.`);
    }
  }

  return {
    direction,
    cars,
    unassignedPassengers,
    demand,
    seatsAvailable,
  };
}

/**
 * Apply manual moves to a plan result.
 * Moves are specified as array of { passengerKey, targetCarIndex }
 * targetCarIndex = -1 means move to leftovers
 */
export interface ManualMove {
  participantKey: string;
  fromCarIndex: number; // -1 = from leftovers
  toCarIndex: number; // -1 = to leftovers
}

function rebalanceCars(cars: CarAssignment[], unassignedPassengers: Participant[]): { cars: CarAssignment[]; unassignedPassengers: Participant[] } {
  const driverKeys = new Set(cars.map((car) => participantKey(car.driver)));
  const assignedKeys = new Set<string>();

  const cleanedCars: CarAssignment[] = cars.map((car) => {
    const passengers: Participant[] = [];
    for (const p of car.passengers) {
      const key = participantKey(p);
      if (driverKeys.has(key) || assignedKeys.has(key)) continue;
      passengers.push(p);
      assignedKeys.add(key);
    }

    return {
      ...car,
      passengers,
    };
  });

  const pool: Participant[] = [];
  const pooledKeys = new Set<string>();

  const pushToPool = (participant: Participant) => {
    const key = participantKey(participant);
    if (driverKeys.has(key) || assignedKeys.has(key) || pooledKeys.has(key)) return;
    pool.push(participant);
    pooledKeys.add(key);
  };

  for (const car of cleanedCars) {
    while (car.passengers.length > car.passengerCapacity) {
      const removed = car.passengers.pop();
      if (removed) {
        assignedKeys.delete(participantKey(removed));
        pushToPool(removed);
      }
    }
  }

  for (const p of unassignedPassengers) {
    pushToPool(p);
  }

  for (const car of cleanedCars) {
    while (car.passengers.length < car.passengerCapacity && pool.length > 0) {
      const next = pool.shift();
      if (!next) break;
      car.passengers.push(next);
      assignedKeys.add(participantKey(next));
      pooledKeys.delete(participantKey(next));
    }
  }

  return {
    cars: cleanedCars,
    unassignedPassengers: pool,
  };
}

export function applyManualMoves(plan: PlanResult, moves: ManualMove[]): PlanResult {
  const newCars: CarAssignment[] = plan.cars.map((car) => ({
    ...car,
    passengers: [...car.passengers],
  }));
  let newUnassignedPassengers = [...plan.unassignedPassengers];

  for (const move of moves) {
    let passenger: Participant | undefined;

    if (move.fromCarIndex === -1) {
      const idx = newUnassignedPassengers.findIndex((p) => participantKey(p) === move.participantKey);
      if (idx !== -1) {
        passenger = newUnassignedPassengers.splice(idx, 1)[0];
      }
    } else if (move.fromCarIndex >= 0 && move.fromCarIndex < newCars.length) {
      const car = newCars[move.fromCarIndex];
      const idx = car.passengers.findIndex((p) => participantKey(p) === move.participantKey);
      if (idx !== -1) {
        passenger = car.passengers.splice(idx, 1)[0];
      }
    }

    if (!passenger) continue;

    if (move.toCarIndex === -1) {
      newUnassignedPassengers.push(passenger);
    } else if (move.toCarIndex >= 0 && move.toCarIndex < newCars.length) {
      newCars[move.toCarIndex].passengers.push(passenger);
    }
  }

  const balanced = rebalanceCars(newCars, newUnassignedPassengers);

  return {
    ...plan,
    cars: balanced.cars,
    unassignedPassengers: balanced.unassignedPassengers,
    seatsAvailable: balanced.cars.reduce((sum, car) => sum + car.passengerCapacity, 0),
  };
}

/**
 * Parse moves from URL query string format: "p0-c1,p2-c0,p3-l"
 * where pX = participant index in original list, cX = car index, l = leftovers
 */
export function parseMovesFromUrl(movesStr: string, plan: PlanResult): ManualMove[] {
  if (!movesStr) return [];

  const moves: ManualMove[] = [];
  const parts = movesStr.split(",");

  // Build a map of participant keys to their current location
  const locationMap = new Map<string, { carIndex: number; passengerIndex: number }>();

  plan.cars.forEach((car, carIndex) => {
    car.passengers.forEach((p, passengerIndex) => {
      locationMap.set(participantKey(p), { carIndex, passengerIndex });
    });
  });

  plan.unassignedPassengers.forEach((p, idx) => {
    locationMap.set(participantKey(p), { carIndex: -1, passengerIndex: idx });
  });

  for (const part of parts) {
    // Format: "key:targetCarIndex" where key is participantKey and target is car index or -1 for leftovers
    const [encodedKey, target] = part.split(":");
    const pKey = encodedKey ? decodeURIComponent(encodedKey) : "";
    if (!pKey || !target) continue;

    const location = locationMap.get(pKey);
    if (!location) continue;

    const toCarIndex = target === "l" ? -1 : parseInt(target, 10);
    if (isNaN(toCarIndex) && target !== "l") continue;

    moves.push({
      participantKey: pKey,
      fromCarIndex: location.carIndex,
      toCarIndex,
    });
  }

  return moves;
}

/**
 * Serialize moves to URL format
 */
export function serializeMovesToUrl(moves: ManualMove[]): string {
  return moves
    .map((m) => `${encodeURIComponent(m.participantKey)}:${m.toCarIndex === -1 ? "l" : m.toCarIndex}`)
    .join(",");
}

function csvEscape(value: string | number): string {
  const str = String(value ?? "");
  if (str.includes('"') || str.includes(",") || str.includes("\n")) {
    return `"${str.replaceAll('"', '""')}"`;
  }
  return str;
}

export function planToCsv(plan: PlanResult): string {
  const header = "Richtung,Status,Name,Gruppe,Fahrer,Plätze,Mitfahrende";
  const rows: string[] = [];

  const fullName = (p: Participant): string => `${p.Vorname} ${p.Nachname}`.trim();

  for (const car of plan.cars) {
    const driverName = fullName(car.driver);
    const passengersText = car.passengers.map((p) => fullName(p)).join(" | ");
    rows.push([
      csvEscape(plan.direction),
      csvEscape("Fahrer"),
      csvEscape(driverName),
      csvEscape(car.driver.Gruppen),
      csvEscape(driverName),
      csvEscape(car.seatsTotal),
      csvEscape(passengersText),
    ].join(","));

    for (const passenger of car.passengers) {
      rows.push([
        csvEscape(plan.direction),
        csvEscape("Mitfahrend"),
        csvEscape(fullName(passenger)),
        csvEscape(passenger.Gruppen),
        csvEscape(driverName),
        csvEscape(""),
        csvEscape(""),
      ].join(","));
    }
  }

  for (const passenger of plan.unassignedPassengers) {
    rows.push([
      csvEscape(plan.direction),
      csvEscape("Ohne Platz"),
      csvEscape(fullName(passenger)),
      csvEscape(passenger.Gruppen),
      csvEscape(""),
      csvEscape(""),
      csvEscape(""),
    ].join(","));
  }

  return [header, ...rows].join("\n");
}
