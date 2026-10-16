mod db;

use std::sync::Mutex;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      let data_dir = app.path().app_data_dir()?;
      std::fs::create_dir_all(&data_dir)?;
      let connection = db::open(&data_dir.join("setlist-maker.db"))?;
      app.manage(db::Database(Mutex::new(connection)));
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![db::db_execute, db::db_select])
    .run(tauri::generate_context!())
    .expect("error while building tauri application");
}
