export interface Participant {
  id?: string;
  Vorname: string;
  Nachname: string;
  Gruppen: string;
  /** Number of children the parent/driver can transport on the outbound trip. */
  Hinfahrt: number;
  /** Number of children the parent/driver can transport on the return trip. */
  Rückfahrt: number;
}

export interface CampflowEvent {
  id: string;
  name: string;
  startDate?: string;
  endDate?: string;
  published?: boolean;
  url?: string;
}

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
  col_K0HMI9HMkVblaqpBqFBu: number | null;
  col_tSMUO3gitt0dXFMOhWGq: number | null;
  birthdate?: string | null;
  primary_email?: string | null;
  cancellation_date?: string | null;
  [key: string]: unknown;
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

export interface CampflowColumn {
  id: string;
  name: string;
  type?: string;
}

export interface ColumnMapping {
  hinfahrtColumn: string;
  rueckfahrtColumn: string;
}

export interface CampflowEventWithColumns extends CampflowEvent {
  columns: CampflowColumn[];
}
