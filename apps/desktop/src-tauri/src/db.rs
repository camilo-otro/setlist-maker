//! SQLite access for the web layer, which owns the schema and queries (@setlist/storage).
//!
//! The app keeps exactly one connection: the repository runs transactions as separate
//! BEGIN / ... / COMMIT calls, which only works if they all reach the same connection.

use std::path::Path;
use std::sync::Mutex;
use std::time::Duration;

use rusqlite::types::{Value, ValueRef};
use rusqlite::{params_from_iter, Connection};
use serde_json::{Map, Value as Json};

/// The app's single connection, shared by every command.
pub struct Database(pub Mutex<Connection>);

pub type Row = Map<String, Json>;

/// Opens (or creates) the database file. WAL keeps reads fast and the file safe if the app quits mid-write.
pub fn open(path: &Path) -> rusqlite::Result<Connection> {
    let connection = Connection::open(path)?;
    connection.pragma_update(None, "journal_mode", "WAL")?;
    connection.busy_timeout(Duration::from_secs(5))?;
    Ok(connection)
}

/// Converts a parameter from JavaScript. Matches `SqlValue` in @setlist/storage: text, numbers and null.
fn to_sql(value: &Json) -> Result<Value, String> {
    match value {
        Json::Null => Ok(Value::Null),
        Json::String(text) => Ok(Value::Text(text.clone())),
        Json::Number(number) => number
            .as_i64()
            .map(Value::Integer)
            .or_else(|| number.as_f64().map(Value::Real))
            .ok_or_else(|| format!("Unsupported number parameter: {number}")),
        other => Err(format!("Unsupported SQL parameter: {other}")),
    }
}

fn to_json(value: ValueRef) -> Result<Json, String> {
    match value {
        ValueRef::Null => Ok(Json::Null),
        ValueRef::Integer(integer) => Ok(Json::from(integer)),
        ValueRef::Real(real) => Ok(Json::from(real)),
        ValueRef::Text(text) => Ok(Json::String(String::from_utf8_lossy(text).into_owned())),
        ValueRef::Blob(_) => Err("Blob columns aren't supported".into()),
    }
}

fn to_params(params: &[Json]) -> Result<Vec<Value>, String> {
    params.iter().map(to_sql).collect()
}

/// Runs one statement, ignoring any rows it returns (some PRAGMAs return a row).
pub fn execute(connection: &Connection, sql: &str, params: &[Json]) -> Result<(), String> {
    let mut statement = connection.prepare(sql).map_err(|e| e.to_string())?;
    let mut rows = statement
        .query(params_from_iter(to_params(params)?))
        .map_err(|e| e.to_string())?;
    while rows.next().map_err(|e| e.to_string())?.is_some() {}
    Ok(())
}

/// Runs one query and returns each row as an object keyed by column name.
pub fn select(connection: &Connection, sql: &str, params: &[Json]) -> Result<Vec<Row>, String> {
    let mut statement = connection.prepare(sql).map_err(|e| e.to_string())?;
    let names: Vec<String> = statement.column_names().into_iter().map(String::from).collect();
    let mut rows = statement
        .query(params_from_iter(to_params(params)?))
        .map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let mut object = Map::new();
        for (index, name) in names.iter().enumerate() {
            let value = row.get_ref(index).map_err(|e| e.to_string())?;
            object.insert(name.clone(), to_json(value)?);
        }
        result.push(object);
    }
    Ok(result)
}

fn lock(database: &Database) -> Result<std::sync::MutexGuard<'_, Connection>, String> {
    database.0.lock().map_err(|_| "The database connection is unavailable".to_string())
}

// `async` runs the commands off the main thread, so database work never blocks the window.
#[tauri::command(async)]
pub fn db_execute(
    database: tauri::State<'_, Database>,
    sql: String,
    params: Vec<Json>,
) -> Result<(), String> {
    let connection = lock(&database)?;
    execute(&connection, &sql, &params)
}

#[tauri::command(async)]
pub fn db_select(
    database: tauri::State<'_, Database>,
    sql: String,
    params: Vec<Json>,
) -> Result<Vec<Row>, String> {
    let connection = lock(&database)?;
    select(&connection, &sql, &params)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn memory() -> Connection {
        let connection = Connection::open_in_memory().unwrap();
        execute(
            &connection,
            r#"CREATE TABLE "songs" ("id" TEXT PRIMARY KEY, "title" TEXT, "bpm" INTEGER, "rating" REAL) STRICT"#,
            &[],
        )
        .unwrap();
        connection
    }

    #[test]
    fn round_trips_text_integers_reals_and_null() {
        let connection = memory();
        execute(
            &connection,
            r#"INSERT INTO "songs" VALUES (?, ?, ?, ?)"#,
            &[json!("a"), json!("Wasteland"), json!(74), json!(4.5)],
        )
        .unwrap();
        execute(
            &connection,
            r#"INSERT INTO "songs" VALUES (?, ?, ?, ?)"#,
            &[json!("b"), json!("Beautiful"), Json::Null, Json::Null],
        )
        .unwrap();

        let rows = select(&connection, r#"SELECT * FROM "songs" ORDER BY "id""#, &[]).unwrap();
        assert_eq!(
            Json::Array(rows.into_iter().map(Json::Object).collect()),
            json!([
                { "id": "a", "title": "Wasteland", "bpm": 74, "rating": 4.5 },
                { "id": "b", "title": "Beautiful", "bpm": null, "rating": null },
            ])
        );
    }

    #[test]
    fn binds_parameters_in_where_clauses() {
        let connection = memory();
        for id in ["a", "b"] {
            execute(&connection, r#"INSERT INTO "songs" ("id") VALUES (?)"#, &[json!(id)]).unwrap();
        }
        let rows = select(&connection, r#"SELECT "id" FROM "songs" WHERE "id" = ?"#, &[json!("b")]).unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0]["id"], json!("b"));
    }

    #[test]
    fn rejects_parameters_storage_never_sends() {
        let connection = memory();
        let error = execute(&connection, r#"SELECT ?"#, &[json!(true)]).unwrap_err();
        assert!(error.contains("Unsupported SQL parameter"));
        assert!(execute(&connection, r#"SELECT ?"#, &[json!(["tag"])]).is_err());
    }

    #[test]
    fn execute_accepts_statements_that_return_rows() {
        let connection = memory();
        execute(&connection, "PRAGMA user_version = 3", &[]).unwrap();
        execute(&connection, "PRAGMA journal_mode", &[]).unwrap();
        let rows = select(&connection, "PRAGMA user_version", &[]).unwrap();
        assert_eq!(rows[0]["user_version"], json!(3));
    }

    #[test]
    fn transactions_span_separate_calls() {
        let connection = memory();
        execute(&connection, "BEGIN IMMEDIATE", &[]).unwrap();
        execute(&connection, r#"INSERT INTO "songs" ("id") VALUES ('x')"#, &[]).unwrap();
        execute(&connection, "ROLLBACK", &[]).unwrap();
        assert!(select(&connection, r#"SELECT * FROM "songs""#, &[]).unwrap().is_empty());
    }

    #[test]
    fn reports_sql_errors_as_messages() {
        let connection = memory();
        let error = execute(&connection, "NOT VALID SQL", &[]).unwrap_err();
        assert!(error.contains("syntax error"), "{error}");
    }
}
