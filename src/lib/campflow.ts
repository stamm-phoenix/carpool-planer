import type { CampflowEvent, Participant } from "./types";

const CAMPFLOW_BASE = "https://api.campflow.de"; // placeholder

export async function fetchCampflowEvents(token: string): Promise<CampflowEvent[]> {
  if (!token) throw new Error("CAMPFLOW_TOKEN is required for production mode");
  const res = await fetch(`${CAMPFLOW_BASE}/v1/events`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) {
    throw new Error(`Campflow events failed: ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as any[];
  // Map to minimal shape
  return data.map((e) => ({
    id: String(e.id ?? e.uuid ?? e._id ?? ""),
    name: e.name ?? e.title ?? "Event",
    startDate: e.startDate ?? e.start ?? e.date ?? undefined,
    endDate: e.endDate ?? e.end ?? undefined,
  }));
}

export async function fetchCampflowParticipants(eventId: string, token: string): Promise<Participant[]> {
  if (!token) throw new Error("CAMPFLOW_TOKEN is required for production mode");
  if (!eventId) throw new Error("eventId is required");
  const res = await fetch(`${CAMPFLOW_BASE}/v1/events/${eventId}/participants`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) {
    throw new Error(`Campflow participants failed: ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as any[];
  return data.map((p) => ({
    Vorname: p.firstName ?? p.firstname ?? p.givenName ?? "",
    Nachname: p.lastName ?? p.lastname ?? p.surname ?? "",
    Gruppen: p.group ?? p.unit ?? "",
    Hinfahrt: Number(p.outboundSeats ?? p.hin ?? 0),
    Rückfahrt: Number(p.returnSeats ?? p.rueck ?? p.rück ?? 0),
  }));
}
