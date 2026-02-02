import type {
  CampflowEvent,
  Participant,
  CampflowApiEvent,
  CampflowApiPerson,
  CampflowApiResponse,
  CampflowColumn,
  ColumnMapping,
} from "./types";

const CAMPFLOW_BASE = "https://api.campflow.de";

// Default custom field IDs for carpool data (from Campflow event configuration)
export const DEFAULT_COLUMN_MAPPING: ColumnMapping = {
  hinfahrtColumn: "col_K0HMI9HMkVblaqpBqFBu",
  rueckfahrtColumn: "col_tSMUO3gitt0dXFMOhWGq",
};

/**
 * Fetch all events from Campflow
 */
export async function fetchCampflowEvents(token: string): Promise<CampflowEvent[]> {
  if (!token) throw new Error("CAMPFLOW_API_KEY is required");

  const res = await fetch(`${CAMPFLOW_BASE}/events`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    throw new Error(`Campflow events failed: ${res.status} ${res.statusText}`);
  }

  const json = (await res.json()) as CampflowApiResponse<CampflowApiEvent>;

  return json.data.map((e) => ({
    id: e.list_id,
    name: e.title,
    startDate: e.start_date ?? undefined,
    endDate: e.end_date ?? undefined,
    published: e.published,
    url: e.url,
  }));
}

/**
 * Fetch participants for a specific event (list) from Campflow
 * Supports pagination for lists with more than 500 participants
 * @param columnMapping - Which columns to use for Hinfahrt/Rückfahrt
 */
export async function fetchCampflowParticipants(
  listId: string,
  token: string,
  columnMapping: ColumnMapping = DEFAULT_COLUMN_MAPPING
): Promise<Participant[]> {
  if (!token) throw new Error("CAMPFLOW_API_KEY is required");
  if (!listId) throw new Error("listId is required");

  const allParticipants: Participant[] = [];
  let cursor: string | null = null;

  do {
    const url = cursor
      ? `${CAMPFLOW_BASE}/lists/${listId}/persons?cursor=${encodeURIComponent(cursor)}`
      : `${CAMPFLOW_BASE}/lists/${listId}/persons`;

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (!res.ok) {
      throw new Error(`Campflow participants failed: ${res.status} ${res.statusText}`);
    }

    const json = (await res.json()) as CampflowApiResponse<CampflowApiPerson>;

    // Filter out cancelled participants and map to our Participant type
    const participants = json.data
      .filter((p) => !p.cancellation_date) // Exclude cancelled registrations
      .map((p) => mapToParticipant(p, columnMapping));

    allParticipants.push(...participants);

    // Check for next page
    cursor = json.meta?.next_cursor ?? null;
  } while (cursor);

  return allParticipants;
}

/**
 * Map Campflow API person to our Participant type
 * @param columnMapping - Which columns to use for Hinfahrt/Rückfahrt
 */
function mapToParticipant(
  person: CampflowApiPerson,
  columnMapping: ColumnMapping
): Participant {
  // Get the first group name (primary group)
  const group = person.group_names?.[0] ?? "";

  // Get carpool seat numbers from configurable custom fields
  const hinfahrt = person[columnMapping.hinfahrtColumn];
  const rueckfahrt = person[columnMapping.rueckfahrtColumn];

  return {
    Vorname: person.name?.first_name ?? "",
    Nachname: person.name?.last_name ?? "",
    Gruppen: group,
    Hinfahrt: typeof hinfahrt === "number" ? hinfahrt : 0,
    Rückfahrt: typeof rueckfahrt === "number" ? rueckfahrt : 0,
  };
}

/**
 * Fetch available columns for an event (list) from Campflow
 * These can be used to let the user select which columns map to Hinfahrt/Rückfahrt
 */
export async function fetchCampflowColumns(
  listId: string,
  token: string
): Promise<CampflowColumn[]> {
  if (!token) throw new Error("CAMPFLOW_API_KEY is required");
  if (!listId) throw new Error("listId is required");

  const res = await fetch(`${CAMPFLOW_BASE}/lists/${listId}/columns`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    // If columns endpoint doesn't exist, return empty array
    if (res.status === 404) {
      return [];
    }
    throw new Error(`Campflow columns failed: ${res.status} ${res.statusText}`);
  }

  const json = (await res.json()) as CampflowApiResponse<{ id: string; name: string; type?: string }>;

  return json.data.map((col) => ({
    id: col.id,
    name: col.name,
    type: col.type,
  }));
}

/**
 * Find an event by name (case-insensitive partial match)
 */
export function findEventByName(
  events: CampflowEvent[],
  searchName: string
): CampflowEvent | undefined {
  const search = searchName.toLowerCase();
  return events.find((e) => e.name.toLowerCase().includes(search));
}

/**
 * Get only published events
 */
export function getPublishedEvents(events: CampflowEvent[]): CampflowEvent[] {
  return events.filter((e) => e.published);
}
