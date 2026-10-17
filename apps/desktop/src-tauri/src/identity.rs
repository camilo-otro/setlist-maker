//! Keeps the device's sign-in (user ID, display name and refresh token, as JSON from
//! @setlist/storage) in the OS keychain: Windows Credential Manager or the macOS Keychain.
//! It's the only thing that proves this device owns its shared bands, so it isn't stored in
//! the database file, which backups and copies would carry around.

use keyring::Entry;

const SERVICE: &str = "io.github.camilootro.setlistmaker";
const ACCOUNT: &str = "identity";

fn entry() -> Result<Entry, String> {
    Entry::new(SERVICE, ACCOUNT).map_err(|e| e.to_string())
}

/// The stored identity, or None before the first share.
#[tauri::command]
pub fn identity_load() -> Result<Option<String>, String> {
    match entry()?.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn identity_save(value: String) -> Result<(), String> {
    entry()?.set_password(&value).map_err(|e| e.to_string())
}
