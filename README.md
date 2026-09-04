# carpool-planer

Fahrgemeinschaftsplanung für den DPSG Stamm Phoenix auf Basis der Campflow API.

## Fachliches Modell

- Campflow liefert pro angemeldeter Person eine Kapazität für Hin- und Rückfahrt.
- Bei Kindern bedeutet ein Wert größer `0`: Ein Elternteil bietet für diese Richtung ein Auto an.
- Die Zahl ist die Anzahl der **Kinder**, die das Elternteil mitnehmen kann. Der erwachsene Fahrer wird nicht abgezogen.
- Der Name des Elternteils wird nicht benötigt und nicht angezeigt. Ein Auto wird als `Eltern von <Kind>` bezeichnet.
- Wird ein Elternauto verwendet, bleibt das zugehörige Kind immer fest in diesem Auto.
- Leitende mit eingetragener Kapazität können selbst als Fahrer eingeplant werden.
- Der Algorithmus versucht mit möglichst wenigen Autos auszukommen und bevorzugt größere Kapazitäten; Familien- und Gruppenzusammenhänge fließen in die Verteilung ein.

## Development (npm)

- Install: `npm install`
- Dev server: `npm run dev`
- Lint/typecheck: `npm run lint` (`astro check`)
- Build: `npm run build`
- Tests: `npm run test` (aktuell noch Stub)

Node >=20 wird benötigt.

## Azure Static Web Apps

- Astro erzeugt statischen Output in `dist/`.
- `staticwebapp.config.json` schützt die App mit Microsoft Entra ID.
- `api/campflow` ist eine Azure Function und spricht Campflow serverseitig an.
- `CAMPFLOW_TOKEN` wird ausschließlich als Azure Static Web Apps Application Setting gesetzt und niemals an den Browser ausgeliefert.
- Frontend-Aufrufe laufen über `/api/campflow`.

## Oberfläche

Die App trennt Planung und Teilnehmendenliste, ohne ein verschachteltes Karten-Dashboard zu verwenden. Der Fahrplan wird als Route dargestellt; ein Auto ist eine Zeile auf dieser Route. Gruppen werden über die DPSG-Stufenfarben codiert, Status und Zusammenhänge primär über Typografie, Abstand und Trennlinien.

Manuelle Anpassungen werden eventbezogen in URL/LocalStorage gespeichert. Das eigene Kind eines ausgewählten Elternautos kann dabei nicht aus diesem Auto verschoben werden.
