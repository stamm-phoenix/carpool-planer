const CAMPFLOW_BASE = "https://api.campflow.de";

function json(status, body) {
  return {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    },
    body: JSON.stringify(body)
  };
}

async function fetchCampflow(path, token) {
  const res = await fetch(`${CAMPFLOW_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    }
  });

  if (!res.ok) {
    throw new Error(`Campflow request failed (${res.status} ${res.statusText}) for ${path}`);
  }

  return res.json();
}

function parseSeatValue(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.trunc(value));
  }
  if (typeof value === "string") {
    const parsed = Number(value.replace(",", ".").trim());
    if (Number.isFinite(parsed)) {
      return Math.max(0, Math.trunc(parsed));
    }
  }
  return 0;
}

function mapEvent(event) {
  return {
    id: event.list_id,
    name: event.title,
    startDate: event.start_date ?? undefined,
    endDate: event.end_date ?? undefined,
    published: event.published,
    url: event.url
  };
}

function mapParticipant(person, columnMapping) {
  const group = person.group_names?.[0] ?? "";
  return {
    id: person.id,
    Vorname: person.name?.first_name ?? "",
    Nachname: person.name?.last_name ?? "",
    Gruppen: group,
    Hinfahrt: parseSeatValue(person[columnMapping.hinfahrtColumn]),
    Rückfahrt: parseSeatValue(person[columnMapping.rueckfahrtColumn])
  };
}

async function fetchEvents(token) {
  const jsonData = await fetchCampflow("/events", token);
  return (jsonData.data ?? []).map(mapEvent);
}

async function fetchParticipants(listId, token, columnMapping) {
  const all = [];
  let cursor = null;

  do {
    const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
    const jsonData = await fetchCampflow(`/lists/${listId}/persons${qs}`, token);
    const rows = (jsonData.data ?? [])
      .filter((p) => !p.cancellation_date)
      .map((p) => mapParticipant(p, columnMapping));

    all.push(...rows);
    cursor = jsonData.meta?.next_cursor ?? null;
  } while (cursor);

  return all;
}

async function fetchColumns(listId, token) {
  try {
    const jsonData = await fetchCampflow(`/lists/${listId}/columns`, token);
    return (jsonData.data ?? []).map((c) => ({ id: c.id, name: c.name, type: c.type }));
  } catch {
    const jsonData = await fetchCampflow(`/lists/${listId}/persons?per_page=100`, token);
    const stats = new Map();

    for (const person of jsonData.data ?? []) {
      for (const [key, value] of Object.entries(person)) {
        if (!key.startsWith("col_")) continue;
        const prev = stats.get(key) ?? { numeric: 0, total: 0 };
        prev.total += 1;
        if (typeof value === "number" || value === null || value === "") {
          prev.numeric += 1;
        }
        stats.set(key, prev);
      }
    }

    return Array.from(stats.entries())
      .filter(([, s]) => s.total > 0 && s.numeric / s.total >= 0.8)
      .map(([id]) => ({ id, name: id, type: "number" }));
  }
}

module.exports = async function (context, req) {
  try {
    const token = process.env.CAMPFLOW_TOKEN;
    if (!token) {
      context.res = json(500, { error: "CAMPFLOW_TOKEN is not configured" });
      return;
    }

    const action = req.query.action ?? "snapshot";
    const eventId = req.query.event ?? "";
    const hinCol = req.query.hinCol ?? "col_K0HMI9HMkVblaqpBqFBu";
    const rueckCol = req.query.rueckCol ?? "col_tSMUO3gitt0dXFMOhWGq";
    const columnMapping = { hinfahrtColumn: hinCol, rueckfahrtColumn: rueckCol };

    if (action === "events") {
      const events = await fetchEvents(token);
      context.res = json(200, { events });
      return;
    }

    if (!eventId) {
      context.res = json(400, { error: "Missing event query parameter" });
      return;
    }

    if (action === "participants") {
      const participants = await fetchParticipants(eventId, token, columnMapping);
      context.res = json(200, { participants, columnMapping });
      return;
    }

    if (action === "columns") {
      const columns = await fetchColumns(eventId, token);
      context.res = json(200, { columns });
      return;
    }

    const [events, columns, participants] = await Promise.all([
      fetchEvents(token),
      fetchColumns(eventId, token),
      fetchParticipants(eventId, token, columnMapping)
    ]);

    context.res = json(200, { events, columns, participants, columnMapping });
  } catch (error) {
    context.log.error(error);
    context.res = json(500, { error: error instanceof Error ? error.message : "Unknown Campflow error" });
  }
};
