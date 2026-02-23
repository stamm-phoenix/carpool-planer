import type { Participant } from "./types";

/**
 * Priority tiers for driver selection:
 * - Tier 0: Leitende (highest priority, use ALL their seats)
 * - Tier 1: Rover
 * - Tier 2: Jupfis, Pfadis, Wölflinge (equal priority)
 * 
 * Within each tier, drivers with more seats are used first (fill cars completely).
 * 
 * Algorithm:
 * 1. Leiter drivers are assigned first and their cars are filled first
 * 2. Passenger placement prefers same-tier and family grouping (same surname)
 * 3. Non-Leiter drivers fill with remaining passengers
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

export function isLeiter(participant: Participant): boolean {
  return getPriorityTier(participant.Gruppen) === 0;
}

function isSameTier(a: Participant, b: Participant): boolean {
  return getPriorityTier(a.Gruppen) === getPriorityTier(b.Gruppen);
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

  let bestIndex = -1;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (let i = 0; i < remaining.length; i += 1) {
    const candidate = remaining[i];
    const candidateSurname = getSurname(candidate);
    const familyCount = candidateSurname ? (counts.get(candidateSurname) ?? 0) : 0;

    let score = 0;

    if (preferLeiterForLeiterDriver && isLeiter(candidate)) score += 40;
    if (isSameTier(driver, candidate)) score += 12;

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
  leftovers: Participant[];
  demand: number;
  seatsAvailable: number;
}

/**
 * Main planning function with smart driver selection:
 * 
 * Key rules:
 * 1. If someone has seats > 0, they are a DRIVER (never a passenger)
 * 2. ALL Leiter drivers always drive (their cars are filled first)
 * 3. Non-Leiter drivers are always shown as drivers
 * 4. Fill cars completely before adding new drivers (big cars first)
 * 5. No person appears twice (driver can't be passenger)
 * 6. Every participant is visible in the plan as either driver, passenger or leftover
 */
export function computePlan(participants: Participant[], direction: Direction): PlanResult {
  const seatKey = direction === "Hinfahrt" ? "Hinfahrt" : "Rückfahrt";
  
  // Track all driver keys - drivers can NEVER be passengers
  const driverKeys = new Set<string>();
  
  // Separate drivers and passengers
  // IMPORTANT: Anyone with seats > 0 is a driver, NOT a passenger
  const leiterDrivers: { participant: Participant; seats: number }[] = [];
  const nonLeiterDrivers: { participant: Participant; seats: number }[] = [];
  const leiterPassengers: Participant[] = [];
  const nonLeiterPassengers: Participant[] = [];
  
  for (const p of participants) {
    const seats = p[seatKey] as number;
    const isLeiterPerson = isLeiter(p);
    const pKey = participantKey(p);
    
    if (seats > 0) {
      // This person is a DRIVER - mark them so they're never added as passenger
      driverKeys.add(pKey);
      if (isLeiterPerson) {
        leiterDrivers.push({ participant: p, seats });
      } else {
        nonLeiterDrivers.push({ participant: p, seats });
      }
    } else {
      // This person needs a ride (passenger)
      if (isLeiterPerson) {
        leiterPassengers.push(p);
      } else {
        nonLeiterPassengers.push(p);
      }
    }
  }
  
  // Sort Leiter drivers: bigger cars first
  leiterDrivers.sort((a, b) => b.seats - a.seats);
  
  // Sort non-Leiter drivers: by seats descending (fill big cars first)
  nonLeiterDrivers.sort((a, b) => b.seats - a.seats);
  
  const cars: CarAssignment[] = [];
  
  // Mutable passenger list (drivers already excluded)
  const remainingPassengers = [...leiterPassengers, ...nonLeiterPassengers]
    .filter((p) => !driverKeys.has(participantKey(p)));
  
  // ============================================
  // PHASE 1: ALL Leiter drivers drive (prefer Leiter, then fill remaining seats)
  // ============================================
  for (const { participant: driver, seats } of leiterDrivers) {
    const passengerCapacity = Math.max(seats - 1, 0);
    const passengers: Participant[] = [];

    while (passengers.length < passengerCapacity && remainingPassengers.length > 0) {
      const passenger = pickBestPassenger(driver, remainingPassengers, passengers, true);
      if (!passenger) break;
      passengers.push(passenger);
    }
    
    cars.push({
      driver,
      seatsTotal: seats,
      passengerCapacity,
      passengers,
    });
  }
  
  // ============================================
  // PHASE 2: Non-Leiter drivers are always listed as drivers
  // ============================================
  for (const { participant: driver, seats } of nonLeiterDrivers) {
    const passengerCapacity = Math.max(seats - 1, 0);
    const passengers: Participant[] = [];
    
    // Fill with available passengers, preferring same tier
    while (passengers.length < passengerCapacity && remainingPassengers.length > 0) {
      const passenger = pickBestPassenger(driver, remainingPassengers, passengers, false);
      if (!passenger) break;
      passengers.push(passenger);
    }
    
    cars.push({
      driver,
      seatsTotal: seats,
      passengerCapacity,
      passengers,
    });
  }
  
  // ============================================
  // Leftovers = passengers who couldn't be assigned
  // ============================================
  const leftovers = remainingPassengers;
  
  // ============================================
  // Validation: Ensure no driver appears as passenger
  // ============================================
  for (const car of cars) {
    for (const p of car.passengers) {
      const pKey = participantKey(p);
      if (driverKeys.has(pKey)) {
        console.error(`BUG: Driver ${p.Vorname} ${p.Nachname} appears as passenger!`);
      }
    }
  }
  
  // Also check leftovers
  for (const p of leftovers) {
    const pKey = participantKey(p);
    if (driverKeys.has(pKey)) {
      console.error(`BUG: Driver ${p.Vorname} ${p.Nachname} appears in leftovers!`);
    }
  }
  
  const demand = leiterPassengers.length + nonLeiterPassengers.length;
  const seatsAvailable = cars.reduce((sum, car) => sum + car.passengerCapacity, 0);

  const assignedPassengerKeys = new Set<string>();
  for (const car of cars) {
    for (const p of car.passengers) {
      assignedPassengerKeys.add(participantKey(p));
    }
  }

  const accountedParticipants = new Set<string>([
    ...Array.from(driverKeys),
    ...Array.from(assignedPassengerKeys),
    ...leftovers.map((p) => participantKey(p)),
  ]);

  for (const p of participants) {
    const key = participantKey(p);
    if (!accountedParticipants.has(key)) {
      console.error(`BUG: Participant ${p.Vorname} ${p.Nachname} is not represented in the plan.`);
    }
  }
  
  return {
    direction,
    cars,
    leftovers,
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
  toCarIndex: number;   // -1 = to leftovers
}

export function applyManualMoves(plan: PlanResult, moves: ManualMove[]): PlanResult {
  // Deep clone the plan
  const newCars: CarAssignment[] = plan.cars.map(car => ({
    ...car,
    passengers: [...car.passengers],
  }));
  let newLeftovers = [...plan.leftovers];
  
  for (const move of moves) {
    // Find and remove the passenger from source
    let passenger: Participant | undefined;
    
    if (move.fromCarIndex === -1) {
      // From leftovers
      const idx = newLeftovers.findIndex(p => participantKey(p) === move.participantKey);
      if (idx !== -1) {
        passenger = newLeftovers.splice(idx, 1)[0];
      }
    } else if (move.fromCarIndex >= 0 && move.fromCarIndex < newCars.length) {
      // From a car
      const car = newCars[move.fromCarIndex];
      const idx = car.passengers.findIndex(p => participantKey(p) === move.participantKey);
      if (idx !== -1) {
        passenger = car.passengers.splice(idx, 1)[0];
      }
    }
    
    if (!passenger) continue;
    
    // Add to destination
    if (move.toCarIndex === -1) {
      // To leftovers
      newLeftovers.push(passenger);
    } else if (move.toCarIndex >= 0 && move.toCarIndex < newCars.length) {
      // To a car
      newCars[move.toCarIndex].passengers.push(passenger);
    }
  }
  
  return {
    ...plan,
    cars: newCars,
    leftovers: newLeftovers,
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
  
  plan.leftovers.forEach((p, idx) => {
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
  const header = "Richtung,Fahrer,Plätze,Mitfahrende";
  const rows = plan.cars.map((car) => {
    const name = `${car.driver.Vorname} ${car.driver.Nachname}`.trim();
    const passengers = car.passengers.map((p) => `${p.Vorname} ${p.Nachname}`.trim()).join(" | ");
    return [csvEscape(plan.direction), csvEscape(name), csvEscape(car.seatsTotal), csvEscape(passengers)].join(",");
  });
  if (plan.leftovers.length) {
    const rest = plan.leftovers.map((p) => `${p.Vorname} ${p.Nachname}`).join(" | ");
    rows.push([csvEscape(plan.direction), csvEscape("OHNE PLATZ"), csvEscape(0), csvEscape(rest)].join(","));
  }
  return [header, ...rows].join("\n");
}
