//! Saving files the app makes, such as a setlist picture, to the Downloads folder.

use std::path::{Path, PathBuf};

use tauri::Manager;

/// `name` in `dir`, or `name (2)`, `name (3)`… if that's taken.
fn free_path(dir: &Path, name: &str) -> PathBuf {
  let path = dir.join(name);
  if !path.exists() {
    return path;
  }
  let (stem, extension) = match name.rsplit_once('.') {
    Some((stem, extension)) => (stem, format!(".{extension}")),
    None => (name, String::new()),
  };
  (2..)
    .map(|n| dir.join(format!("{stem} ({n}){extension}")))
    .find(|path| !path.exists())
    .expect("a free name")
}

/// Writes `bytes` to the Downloads folder as `name` (only its last part, so it stays there) and
/// returns where it went.
#[tauri::command(async)]
pub fn save_download(app: tauri::AppHandle, name: String, bytes: Vec<u8>) -> Result<String, String> {
  let name = Path::new(&name)
    .file_name()
    .and_then(|name| name.to_str())
    .filter(|name| !name.is_empty())
    .ok_or("That isn't a file name")?
    .to_owned();
  let dir = app.path().download_dir().map_err(|e| e.to_string())?;
  std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
  let path = free_path(&dir, &name);
  std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
  Ok(path.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn numbers_names_already_taken() {
    let dir = std::env::temp_dir().join(format!("setlist-downloads-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    assert_eq!(free_path(&dir, "gig.png"), dir.join("gig.png"));
    std::fs::write(dir.join("gig.png"), b"1").unwrap();
    assert_eq!(free_path(&dir, "gig.png"), dir.join("gig (2).png"));
    std::fs::write(dir.join("gig (2).png"), b"2").unwrap();
    assert_eq!(free_path(&dir, "gig.png"), dir.join("gig (3).png"));
    std::fs::remove_dir_all(&dir).unwrap();
  }
}
