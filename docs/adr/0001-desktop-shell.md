# ADR 0001 — Desktop shell: Tauri 2

- **Status:** Accepted
- **Date:** 2026-10-16
- **Issue:** #1

## Context

Setlist Maker is desktop-first (Windows and macOS), but the same UI and domain code must later run as a web app and a mobile app. The UI is React + TypeScript, data lives in a local SQLite database, and drag and drop is central to the setlist editor.

## Options

|                      | Tauri 2                                                | Electron                                  |
| -------------------- | ------------------------------------------------------ | ----------------------------------------- |
| Installer size       | ~5–15 MB (uses the OS webview)                         | ~80–150 MB (bundles Chromium)             |
| Memory use           | Low                                                    | Higher (a Chromium instance per app)      |
| Rendering engine     | WebView2 (Windows), WKWebView (macOS) — differs per OS | Chromium everywhere — identical behaviour |
| Native code          | Rust                                                   | Node.js                                   |
| SQLite               | Official SQL plugin, or a Rust-side database           | `better-sqlite3` and similar              |
| Mobile               | iOS and Android from the same project                  | None                                      |
| Auto-update, signing | Built-in updater plugin, GitHub Releases               | Mature tooling (electron-builder)         |

## Decision

Use **Tauri 2**.

## Consequences

- Small, fast installers, and a path to mobile from the same project (Phase 8).
- The team needs the **Rust toolchain** to build the app (rustup, plus the Visual Studio C++ Build Tools on Windows), even though app code stays in TypeScript.
- Webviews differ between Windows and macOS, so drag and drop and layout are tested on both in CI (#4) and by hand before releases. Features are limited to what Safari's WebKit supports.
- Any native capability (file access, SQLite, updater) goes through Tauri plugins with explicit permissions, which keeps the app's attack surface small.
- Switching to Electron later only affects `apps/desktop`; `core`, `storage` and `ui` are shell-agnostic.
