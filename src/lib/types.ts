export interface Participant {
  Vorname: string;
  Nachname: string;
  Gruppen: string;
  Hinfahrt: number;
  Rückfahrt: number;
}

export interface CampflowEvent {
  id: string;        // The list_id from Campflow API
  name: string;      // Event title
  startDate?: string;
  endDate?: string;
  published?: boolean;
  url?: string;
}

// Raw API response types for Campflow
export interface CampflowApiEvent {
  list_id: string;
  title: string;
  start_date: string | null;
  end_date: string | null;
  published: boolean;
  url: string;
  embed_snippet: string;
}

export interface CampflowApiPerson {
  id: string;
  name: {
    first_name: string;
    last_name: string;
  };
  group_names: string[];
  // Custom fields for carpool
  col_K0HMI9HMkVblaqpBqFBu: number | null; // Hinfahrt (outbound seats)
  col_tSMUO3gitt0dXFMOhWGq: number | null; // Rückfahrt (return seats)
  // Other standard fields we might use
  birthdate?: string | null;
  primary_email?: string | null;
  cancellation_date?: string | null;
  [key: string]: unknown; // Allow other fields
}

export interface CampflowApiResponse<T> {
  data: T[];
  meta?: {
    path: string;
    per_page: number;
    next_cursor: string | null;
    prev_cursor: string | null;
  };
}
