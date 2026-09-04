import type { Participant } from "./types";

export const groupPriorityOrder = [
  "Leitende",
  "Rover",
  "Jungpfadfinder*innen",
  "Pfadfinder*innen",
  "Wölflinge",
];

const GROUP_PATTERNS = {
  leiter: ["leitend", "externe", "ehemalige"],
  rover: ["rover"],
  jupfi: ["jungpfadfinder"],
  pfadi: ["pfadfinder"],
  woelflinge: ["wölflinge", "wölfling", "woelfling"],
} as const;

function getPriorityTier(group: string): number {
  const value = group?.toLowerCase() ?? "";
  if (GROUP_PATTERNS.leiter.some((pattern) => value.includes(pattern))) return 0;
  if (GROUP_PATTERNS.rover.some((pattern) => value.includes(pattern))) return 1;
  if (GROUP_PATTERNS.jupfi.some((pattern) => value.includes(pattern))) return 2;
  if (GROUP_PATTERNS.pfadi.some((pattern) => value.includes(pattern))) return 2;
  if (GROUP_PATTERNS.woelflinge.some((pattern) => value.includes(pattern))) return 2;
  return 3;
}

export function getGroupCategory(group: string): string {
  const value = group?.toLowerCase() ?? "";
  if (GROUP_PATTERNS.leiter.some((pattern) => value.includes(pattern))) return "Leitende";
  if (GROUP_PATTERNS.rover.some((pattern) => value.includes(pattern))) return "Rover";
  if (GROUP_PATTERNS.jupfi.some((pattern) => value.includes(pattern))) return "Jungpfadfinder*innen";
  if (GROUP_PATTERNS.pfadi.some((pattern) => value.includes(pattern))) return "Pfadfinder*innen";
  if (GROUP_PATTERNS.woelflinge.some((pattern) => value.includes(pattern))) return "Wölflinge";
  return group || "Unbekannt";
}

export function isLeiter(participant: Participant): boolean {
  return getPriorityTier(participant.Gruppen) === 0;
}

export function participantKey(participant: Participant): string {
  if (participant.id) return participant.id;
  return `${participant.Vorname}|${participant.Nachname}|${participant.Gruppen}`;
}

export type Direction = "Hinfahrt" | "Rückfahrt";
export type CarKind = "parent" | "leader";

/**
 * A car is identified through the Campflow participant who supplied the capacity.
 * For children this means: their parent drives, but the parent's name is not known.
 * The child is therefore the stable anchor for the car and must stay in it.
 * For leaders the participant can be the actual driver.
 */
export interface CarAssignment {
  anchor: Participant;
  kind: CarKind;
  /** Number of children/participants the car can transport; the adult driver is not counted. */
  childCapacity: number;
  passengers: Participant[];
}

export interface PlanResult {
  direction: Direction;
  cars: CarAssignment[];
  unassignedPassengers: Participant[];
  demand: number;
  seatsAvailable: number;
}

type CarCandidate = {
  participant: Participant;
  childCapacity: number;
  kind: CarKind;
};

function fullName(participant: Participant): string {
  return `${participant.Vorname} ${participant.Nachname}`.trim();
}

export function carLabel(car: CarAssignment): string {
  return car.kind === "leader"
    ? fullName(car.anchor)
    : `Eltern von ${fullName(car.anchor)}`;
}

function getSurname(participant: Participant): string {
  return (participant.Nachname ?? "").trim().toLowerCase();
}

function surnameCounts(passengers: Participant[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const passenger of passengers) {
    const surname = getSurname(passenger);
    if (!surname) continue;
    counts.set(surname, (counts.get(surname) ?? 0) + 1);
  }
  return counts;
}

function pickBestPassenger(
  anchor: Participant,
  remaining: Participant[],
  inCar: Participant[],
): Participant | undefined {
  if (remaining.length === 0) return undefined;

  const anchorSurname = getSurname(anchor);
  const inCarSurnames = new Set(inCar.map(getSurname).filter(Boolean));
  const familyCounts = surnameCounts(remaining);
  const anchorTier = getPriorityTier(anchor.Gruppen);

  let bestIndex = -1;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (let index = 0; index < remaining.length; index += 1) {
    const candidate = remaining[index];
    const candidateSurname = getSurname(candidate);
    const candidateTier = getPriorityTier(candidate.Gruppen);
    let score = 0;

    if (candidateTier === anchorTier) score += 40;

    if (candidateSurname && (candidateSurname === anchorSurname || inCarSurnames.has(candidateSurname))) {
      score += 50;
    }
    if (candidateSurname && (familyCounts.get(candidateSurname) ?? 0) > 1) {
      score += 12;
    }

    if (isLeiter(anchor) && isLeiter(candidate)) score += 20;

    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  }

  if (bestIndex === -1) return undefined;
  return remaining.splice(bestIndex, 1)[0];
}

function sortCandidates(a: CarCandidate, b: CarCandidate): number {
  if (b.childCapacity !== a.childCapacity) return b.childCapacity - a.childCapacity;
  const tierDiff = getPriorityTier(a.participant.Gruppen) - getPriorityTier(b.participant.Gruppen);
  if (tierDiff !== 0) return tierDiff;
  return fullName(a.participant).localeCompare(fullName(b.participant), "de");
}

function isLockedPassenger(car: CarAssignment, participant: Participant): boolean {
  return car.kind === "parent" && participantKey(car.anchor) === participantKey(participant);
}

function fillCars(cars: CarAssignment[], pool: Participant[]): Participant[] {
  for (const car of cars) {
    while (car.passengers.length < car.childCapacity && pool.length > 0) {
      const next = pickBestPassenger(car.anchor, pool, car.passengers);
      if (!next) break;
      car.passengers.push(next);
    }
  }
  return pool;
}

/**
 * Builds a plan from Campflow's per-person capacity fields.
 *
 * Rules:
 * 1. A positive value on a child means their parent offers a car for that direction.
 * 2. The value is the number of children the parent can transport; the adult driver is not counted.
 * 3. If that parent car is selected, its own child is locked into that car.
 * 4. A leader with a positive value can be the actual driver; their own person does not consume child capacity.
 * 5. As few cars as possible are selected, preferring larger capacities first.
 */
export function computePlan(
  participants: Participant[],
  direction: Direction,
  forcedCarKeys: Iterable<string> = [],
  excludedParticipantKeys: Iterable<string> = [],
  disabledCarKeys: Iterable<string> = [],
): PlanResult {
  const capacityKey = direction === "Hinfahrt" ? "Hinfahrt" : "Rückfahrt";
  const forcedKeys = new Set(forcedCarKeys);
  const excludedKeys = new Set(excludedParticipantKeys);
  const disabledKeys = new Set(disabledCarKeys);
  const activeParticipants = participants.filter(
    (participant) => !excludedKeys.has(participantKey(participant)),
  );

  const candidates: CarCandidate[] = activeParticipants
    .map((participant) => ({
      participant,
      childCapacity: Math.max(0, Number(participant[capacityKey]) || 0),
      kind: isLeiter(participant) ? ("leader" as const) : ("parent" as const),
    }))
    .filter((candidate) => candidate.childCapacity > 0 && !disabledKeys.has(participantKey(candidate.participant)))
    .sort(sortCandidates);

  const forced = candidates.filter((candidate) => forcedKeys.has(participantKey(candidate.participant)));
  const optional = candidates.filter((candidate) => !forcedKeys.has(participantKey(candidate.participant)));

  const selected: CarCandidate[] = [];
  let selectedChildCapacity = 0;
  let selectedLeaderDrivers = 0;

  const addCandidate = (candidate: CarCandidate) => {
    selected.push(candidate);
    selectedChildCapacity += candidate.childCapacity;
    if (candidate.kind === "leader") selectedLeaderDrivers += 1;
  };

  for (const candidate of forced) addCandidate(candidate);

  for (const candidate of optional) {
    if (selectedChildCapacity + selectedLeaderDrivers >= activeParticipants.length) break;
    addCandidate(candidate);
  }

  const selectedAnchorKeys = new Set(selected.map((candidate) => participantKey(candidate.participant)));
  const pool = activeParticipants.filter((participant) => !selectedAnchorKeys.has(participantKey(participant)));

  const cars: CarAssignment[] = selected.map((candidate) => ({
    anchor: candidate.participant,
    kind: candidate.kind,
    childCapacity: candidate.childCapacity,
    passengers: candidate.kind === "parent" ? [candidate.participant] : [],
  }));

  const unassignedPassengers = fillCars(cars, pool);
  const demand = activeParticipants.length - selectedLeaderDrivers;
  const seatsAvailable = cars.reduce((sum, car) => sum + car.childCapacity, 0);

  return {
    direction,
    cars,
    unassignedPassengers: [...unassignedPassengers],
    demand,
    seatsAvailable,
  };
}

export interface ManualMove {
  participantKey: string;
  fromCarIndex: number;
  toCarIndex: number;
}

function rebalanceCars(
  cars: CarAssignment[],
  unassignedPassengers: Participant[],
): { cars: CarAssignment[]; unassignedPassengers: Participant[] } {
  const leaderDriverKeys = new Set(
    cars.filter((car) => car.kind === "leader").map((car) => participantKey(car.anchor)),
  );
  const assignedKeys = new Set<string>();

  const cleanedCars = cars.map((car) => {
    const passengers: Participant[] = [];

    if (car.kind === "parent") {
      passengers.push(car.anchor);
      assignedKeys.add(participantKey(car.anchor));
    }

    for (const passenger of car.passengers) {
      const key = participantKey(passenger);
      if (isLockedPassenger(car, passenger)) continue;
      if (leaderDriverKeys.has(key) || assignedKeys.has(key)) continue;
      passengers.push(passenger);
      assignedKeys.add(key);
    }

    return { ...car, passengers };
  });

  const pool: Participant[] = [];
  const pooledKeys = new Set<string>();

  const pushToPool = (participant: Participant) => {
    const key = participantKey(participant);
    if (leaderDriverKeys.has(key) || assignedKeys.has(key) || pooledKeys.has(key)) return;
    pool.push(participant);
    pooledKeys.add(key);
  };

  for (const car of cleanedCars) {
    while (car.passengers.length > car.childCapacity) {
      const removableIndex = car.passengers.findLastIndex((passenger) => !isLockedPassenger(car, passenger));
      if (removableIndex === -1) break;
      const [removed] = car.passengers.splice(removableIndex, 1);
      assignedKeys.delete(participantKey(removed));
      pushToPool(removed);
    }
  }

  for (const passenger of unassignedPassengers) pushToPool(passenger);

  fillCars(cleanedCars, pool);

  return { cars: cleanedCars, unassignedPassengers: pool };
}

export function applyManualMoves(plan: PlanResult, moves: ManualMove[]): PlanResult {
  const cars = plan.cars.map((car) => ({ ...car, passengers: [...car.passengers] }));
  let unassignedPassengers = [...plan.unassignedPassengers];

  for (const move of moves) {
    let passenger: Participant | undefined;

    if (move.fromCarIndex === -1) {
      const index = unassignedPassengers.findIndex((item) => participantKey(item) === move.participantKey);
      if (index !== -1) passenger = unassignedPassengers.splice(index, 1)[0];
    } else if (move.fromCarIndex >= 0 && move.fromCarIndex < cars.length) {
      const source = cars[move.fromCarIndex];
      const index = source.passengers.findIndex((item) => participantKey(item) === move.participantKey);
      if (index !== -1) {
        const candidate = source.passengers[index];
        if (isLockedPassenger(source, candidate)) continue;
        passenger = source.passengers.splice(index, 1)[0];
      }
    }

    if (!passenger) continue;

    if (move.toCarIndex === -1) {
      unassignedPassengers.push(passenger);
    } else if (move.toCarIndex >= 0 && move.toCarIndex < cars.length) {
      cars[move.toCarIndex].passengers.push(passenger);
    } else {
      unassignedPassengers.push(passenger);
    }
  }

  const balanced = rebalanceCars(cars, unassignedPassengers);
  return {
    ...plan,
    cars: balanced.cars,
    unassignedPassengers: balanced.unassignedPassengers,
    seatsAvailable: balanced.cars.reduce((sum, car) => sum + car.childCapacity, 0),
  };
}

export function parseMovesFromUrl(movesStr: string, plan: PlanResult): ManualMove[] {
  if (!movesStr) return [];

  const locations = new Map<string, number>();
  plan.cars.forEach((car, carIndex) => {
    car.passengers.forEach((passenger) => {
      if (!isLockedPassenger(car, passenger)) locations.set(participantKey(passenger), carIndex);
    });
  });
  plan.unassignedPassengers.forEach((passenger) => locations.set(participantKey(passenger), -1));

  const moves: ManualMove[] = [];
  for (const part of movesStr.split(",")) {
    const [encodedKey, target] = part.split(":");
    if (!encodedKey || !target) continue;

    let key = "";
    try {
      key = decodeURIComponent(encodedKey);
    } catch {
      continue;
    }

    const fromCarIndex = locations.get(key);
    if (fromCarIndex === undefined) continue;
    const toCarIndex = target === "l" ? -1 : Number.parseInt(target, 10);
    if (!Number.isInteger(toCarIndex)) continue;

    moves.push({ participantKey: key, fromCarIndex, toCarIndex });
  }
  return moves;
}

export function serializeMovesToUrl(moves: ManualMove[]): string {
  return moves
    .map((move) => `${encodeURIComponent(move.participantKey)}:${move.toCarIndex === -1 ? "l" : move.toCarIndex}`)
    .join(",");
}

function csvEscape(value: string | number): string {
  const text = String(value ?? "");
  if (text.includes('"') || text.includes(",") || text.includes("\n")) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

export function planToCsv(plan: PlanResult): string {
  const header = "Richtung,Status,Name,Gruppe,Auto,Kapazität Kinder";
  const rows: string[] = [];

  for (const car of plan.cars) {
    const label = carLabel(car);

    if (car.kind === "leader") {
      rows.push([
        csvEscape(plan.direction),
        csvEscape("Fahrer"),
        csvEscape(fullName(car.anchor)),
        csvEscape(car.anchor.Gruppen),
        csvEscape(label),
        csvEscape(car.childCapacity),
      ].join(","));
    }

    for (const passenger of car.passengers) {
      const locked = isLockedPassenger(car, passenger);
      rows.push([
        csvEscape(plan.direction),
        csvEscape(locked ? "Eigenes Kind" : "Mitfahrend"),
        csvEscape(fullName(passenger)),
        csvEscape(passenger.Gruppen),
        csvEscape(label),
        csvEscape(locked ? car.childCapacity : ""),
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
    ].join(","));
  }

  return [header, ...rows].join("\n");
}
