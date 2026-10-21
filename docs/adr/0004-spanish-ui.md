# ADR 0004 — The app speaks Colombian Spanish

- **Status:** Accepted
- **Date:** 2026-10-21

## Context

The app's users are bands in Colombia. Everything the app says was written in English: about 500 strings across the desktop and web app, the share-link viewer, the printed PDF, the setlist image, the WhatsApp text, the sign-in emails and the Spotify playlists' description. Dates followed the device's language, so the same gig read differently on different phones.

We weighed offering English and Spanish. That means moving every string into translation files, a language switcher, and writing every future screen twice. Nobody using the app needs English today, and adding it later costs about what it would cost now. So the app is Spanish only.

## Decision

- **All text the app shows is Spanish, as spoken in Colombia.** That covers every screen, dialog, error and empty state, the viewer, the exports (PDF, image, WhatsApp), the emails, and text the server writes where people see it (the playlists' description).
- **Tú, not usted.** Friendly and direct: "Agrega una canción", "Comparte tu setlist".
- **Formats are fixed to `es-CO`, not the device's language.** They come from `packages/core/src/format.ts`, so every screen and export agrees:
  - **Dates:** "23 de oct de 2026" in lists, "viernes, 23 de octubre de 2026" on the gig page.
  - **Times:** 12-hour with a. m. / p. m., "9:30 p. m.". They're still stored as `HH:MM`.
  - **Numbers:** Colombian separators, "6.573".
- **`<html lang="es-CO">`**, so browsers, screen readers and spell checkers use Spanish.
- **Kept as they are:**
  - **The name, Setlist Maker.**
  - **"Setlist" and "set":** bands use these words in Spanish ("el setlist", "Set 1"). So is **"Encore"**.
  - **Spotify's link wording, "Open Spotify".** Its design guidelines list only "Open Spotify", "Play on Spotify" and "Listen on Spotify", and say nothing about translations, so we keep the approved wording exactly (ADR 0003).
  - **Musical keys** ("Em", "F#"), as musicians write them.
  - **Code, comments, commit messages, docs and tests' names** stay in English. Only what users see changes.
- **CSV import** still recognises English column names, and also Spanish ones ("título", "artista", "tono"…), and Spanish values ("sí", "archivada").
- **Validation messages** come from Zod's Spanish locale (`z.config(z.locales.es())` in `schemas/common.ts`), and our own messages are written in Spanish.

## Glossary

Use these words everywhere, so a thing has one name.

| English              | Spanish                                  | Notes                                                        |
| -------------------- | ---------------------------------------- | ------------------------------------------------------------ |
| Library              | Repertorio                               | The band's songs                                             |
| Song                 | Canción                                  |                                                              |
| Gig                  | Toque                                    | How Colombian bands say it ("tenemos toque el viernes")      |
| Upcoming / Past      | Próximos / Pasados                       | Toques                                                       |
| Venue                | Lugar                                    |                                                              |
| Setlist              | Setlist                                  | "el setlist"                                                 |
| Set                  | Set                                      | "Set 1", "el set"                                            |
| Encore               | Encore                                   |                                                              |
| Break                | Descanso                                 |                                                              |
| Note (setlist entry) | Nota                                     |                                                              |
| Segue                | Enlace                                   | "Enlaza con la siguiente"                                    |
| Template             | Plantilla                                |                                                              |
| Band                 | Banda                                    |                                                              |
| Key                  | Tono                                     | Not "tonalidad"                                              |
| Tempo (BPM)          | Tempo (BPM)                              |                                                              |
| Length               | Duración                                 |                                                              |
| Tuning               | Afinación                                |                                                              |
| Tags                 | Etiquetas                                |                                                              |
| Notes (free text)    | Notas                                    |                                                              |
| Original             | Original                                 |                                                              |
| Active               | Activa                                   | Song status                                                  |
| Learning             | En práctica                              | Song status                                                  |
| Retired / archived   | Archivada                                | Song status                                                  |
| Load-in / Start      | Montaje / Inicio                         | Gig times                                                    |
| Mark as played       | Marcar como tocado                       | "Tocado" for a played gig                                    |
| Cancelled            | Cancelado                                |                                                              |
| Running time         | Duración total                           |                                                              |
| Rate / rating        | Calificar / calificación                 | "Calificar canciones"                                        |
| Stats                | Estadísticas                             |                                                              |
| Share / share link   | Compartir / enlace para compartir        |                                                              |
| Invite               | Invitar / invitación                     |                                                              |
| Owner/editor/viewer  | Administrador / Editor / Solo lectura    | Member roles                                                 |
| Member               | Integrante                               | A band member                                                |
| Sign-in code         | Código de acceso                         | Emails and account securing                                  |
| Sync                 | Sincronizar / sincronización             |                                                              |
| Undo / Redo          | Deshacer / Rehacer                       |                                                              |
| Print                | Imprimir                                 |                                                              |
| Copy for WhatsApp    | Copiar para WhatsApp                     |                                                              |
| Spotify playlist     | Playlist de Spotify                      | "la playlist"; the description says "Hecha con Setlist Maker" |

## Consequences

- One pass translates everything, and tests that find elements by their text change with it.
- New features are written in Spanish from the start, using this glossary. Copy reviews check the glossary and tú.
- Supabase's auth emails come from `supabase/templates`, so they're translated there, and deploy like the rest.
- **To revisit:** if a band that doesn't speak Spanish starts using the app. Adding English then means moving strings into translation files and adding a language setting.
