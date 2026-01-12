export interface Participant {
  Vorname: string;
  Nachname: string;
  Gruppen: string;
  Hinfahrt: number;
  Rückfahrt: number;
}

export interface CampflowEvent {
  id: string;
  name: string;
  startDate?: string;
  endDate?: string;
}
