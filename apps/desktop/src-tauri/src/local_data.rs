#![cfg_attr(not(test), allow(dead_code))]

use std::{io::ErrorKind, path::Path};

use rusqlite::{params, Connection, OptionalExtension};
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use serde_json::Value;

use crate::CompanionSettings;

const COMPANION_SETTINGS_KEY: &str = "companion";

pub struct LocalDataService {
    connection: Connection,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderMetadata {
    pub provider_id: String,
    pub provider_kind: String,
    pub display_name: String,
    pub auth_status: String,
    pub secret_ref: Option<String>,
    pub metadata: Value,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
pub struct TaskMetadata {
    pub task_id: String,
    pub title: String,
    pub status: String,
    pub metadata: Value,
}

impl LocalDataService {
    pub fn open(path: impl AsRef<Path>) -> Result<Self, String> {
        if let Some(parent_dir) = path.as_ref().parent() {
            std::fs::create_dir_all(parent_dir).map_err(|error| error.to_string())?;
        }

        let connection = Connection::open(path).map_err(|error| error.to_string())?;
        let service = Self { connection };
        service.migrate()?;
        Ok(service)
    }

    #[cfg(test)]
    pub(crate) fn in_memory() -> Result<Self, String> {
        let connection = Connection::open_in_memory().map_err(|error| error.to_string())?;
        let service = Self { connection };
        service.migrate()?;
        Ok(service)
    }

    fn migrate(&self) -> Result<(), String> {
        self.connection
            .execute_batch(
                "
                PRAGMA foreign_keys = ON;

                CREATE TABLE IF NOT EXISTS settings (
                    key TEXT PRIMARY KEY,
                    value_json TEXT NOT NULL,
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS provider_metadata (
                    provider_id TEXT PRIMARY KEY,
                    provider_kind TEXT NOT NULL,
                    display_name TEXT NOT NULL,
                    auth_status TEXT NOT NULL,
                    secret_ref TEXT,
                    metadata_json TEXT NOT NULL DEFAULT '{}',
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS task_metadata (
                    task_id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    status TEXT NOT NULL,
                    metadata_json TEXT NOT NULL DEFAULT '{}',
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS memory_metadata (
                    memory_id TEXT PRIMARY KEY,
                    summary TEXT NOT NULL,
                    source_kind TEXT NOT NULL,
                    metadata_json TEXT NOT NULL DEFAULT '{}',
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS capability_metadata (
                    capability_id TEXT PRIMARY KEY,
                    capability_kind TEXT NOT NULL,
                    enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
                    metadata_json TEXT NOT NULL DEFAULT '{}',
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS audit_history (
                    audit_id INTEGER PRIMARY KEY AUTOINCREMENT,
                    category TEXT NOT NULL,
                    action TEXT NOT NULL,
                    metadata_json TEXT NOT NULL DEFAULT '{}',
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE IF NOT EXISTS user_preferences (
                    key TEXT PRIMARY KEY,
                    value_json TEXT NOT NULL,
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                );
                ",
            )
            .map_err(|error| error.to_string())
    }

    pub fn read_companion_settings(&self) -> Result<Option<CompanionSettings>, String> {
        self.connection
            .query_row(
                "SELECT value_json FROM settings WHERE key = ?1",
                [COMPANION_SETTINGS_KEY],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .map_err(|error| error.to_string())?
            .map(|settings_json| decode_json(&settings_json))
            .transpose()
    }

    pub fn read_or_import_legacy_companion_settings(
        &self,
        legacy_settings_path: impl AsRef<Path>,
    ) -> Result<Option<CompanionSettings>, String> {
        if let Some(settings) = self.read_companion_settings()? {
            return Ok(Some(settings));
        }

        let legacy_settings_json = match std::fs::read_to_string(legacy_settings_path) {
            Ok(settings_json) => settings_json,
            Err(error) if error.kind() == ErrorKind::NotFound => return Ok(None),
            Err(error) => return Err(error.to_string()),
        };
        let settings = decode_json(&legacy_settings_json)?;

        self.save_companion_settings(&settings)?;

        Ok(Some(settings))
    }

    pub fn save_companion_settings(&self, settings: &CompanionSettings) -> Result<(), String> {
        let settings_json = encode_json(settings)?;

        self.connection
            .execute(
                "
                INSERT INTO settings (key, value_json, updated_at)
                VALUES (?1, ?2, CURRENT_TIMESTAMP)
                ON CONFLICT(key) DO UPDATE SET
                    value_json = excluded.value_json,
                    updated_at = excluded.updated_at
                ",
                params![COMPANION_SETTINGS_KEY, settings_json],
            )
            .map_err(|error| error.to_string())?;

        self.record_audit_entry("settings", "companion_settings.saved", Value::Null)
    }

    pub fn upsert_provider_metadata(&self, provider: &ProviderMetadata) -> Result<(), String> {
        validate_provider_metadata(&provider.metadata)?;
        let metadata_json = encode_json(&provider.metadata)?;

        self.connection
            .execute(
                "
                INSERT INTO provider_metadata (
                    provider_id,
                    provider_kind,
                    display_name,
                    auth_status,
                    secret_ref,
                    metadata_json,
                    updated_at
                )
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, CURRENT_TIMESTAMP)
                ON CONFLICT(provider_id) DO UPDATE SET
                    provider_kind = excluded.provider_kind,
                    display_name = excluded.display_name,
                    auth_status = excluded.auth_status,
                    secret_ref = excluded.secret_ref,
                    metadata_json = excluded.metadata_json,
                    updated_at = excluded.updated_at
                ",
                params![
                    provider.provider_id,
                    provider.provider_kind,
                    provider.display_name,
                    provider.auth_status,
                    provider.secret_ref,
                    metadata_json
                ],
            )
            .map_err(|error| error.to_string())?;

        self.record_audit_entry(
            "provider_metadata",
            "provider_metadata.upserted",
            Value::String(provider.provider_id.clone()),
        )
    }

    pub fn read_provider_metadata(
        &self,
        provider_id: &str,
    ) -> Result<Option<ProviderMetadata>, String> {
        self.connection
            .query_row(
                "
                SELECT provider_id, provider_kind, display_name, auth_status, secret_ref, metadata_json
                FROM provider_metadata
                WHERE provider_id = ?1
                ",
                [provider_id],
                |row| {
                    let metadata_json: String = row.get(5)?;
                    let metadata = serde_json::from_str(&metadata_json).map_err(|error| {
                        rusqlite::Error::FromSqlConversionFailure(
                            5,
                            rusqlite::types::Type::Text,
                            Box::new(error),
                        )
                    })?;

                    Ok(ProviderMetadata {
                        provider_id: row.get(0)?,
                        provider_kind: row.get(1)?,
                        display_name: row.get(2)?,
                        auth_status: row.get(3)?,
                        secret_ref: row.get(4)?,
                        metadata,
                    })
                },
            )
            .optional()
            .map_err(|error| error.to_string())
    }

    pub fn upsert_task_metadata(&self, task: &TaskMetadata) -> Result<(), String> {
        let metadata_json = encode_json(&task.metadata)?;

        self.connection
            .execute(
                "
                INSERT INTO task_metadata (task_id, title, status, metadata_json, updated_at)
                VALUES (?1, ?2, ?3, ?4, CURRENT_TIMESTAMP)
                ON CONFLICT(task_id) DO UPDATE SET
                    title = excluded.title,
                    status = excluded.status,
                    metadata_json = excluded.metadata_json,
                    updated_at = excluded.updated_at
                ",
                params![task.task_id, task.title, task.status, metadata_json],
            )
            .map_err(|error| error.to_string())?;

        self.record_audit_entry(
            "task_metadata",
            "task_metadata.upserted",
            Value::String(task.task_id.clone()),
        )
    }

    pub fn read_task_metadata(&self, task_id: &str) -> Result<Option<TaskMetadata>, String> {
        self.connection
            .query_row(
                "
                SELECT task_id, title, status, metadata_json
                FROM task_metadata
                WHERE task_id = ?1
                ",
                [task_id],
                |row| {
                    let metadata_json: String = row.get(3)?;
                    let metadata = serde_json::from_str(&metadata_json).map_err(|error| {
                        rusqlite::Error::FromSqlConversionFailure(
                            3,
                            rusqlite::types::Type::Text,
                            Box::new(error),
                        )
                    })?;

                    Ok(TaskMetadata {
                        task_id: row.get(0)?,
                        title: row.get(1)?,
                        status: row.get(2)?,
                        metadata,
                    })
                },
            )
            .optional()
            .map_err(|error| error.to_string())
    }

    fn record_audit_entry(
        &self,
        category: &str,
        action: &str,
        metadata: Value,
    ) -> Result<(), String> {
        let metadata_json = encode_json(&metadata)?;

        self.connection
            .execute(
                "
                INSERT INTO audit_history (category, action, metadata_json)
                VALUES (?1, ?2, ?3)
                ",
                params![category, action, metadata_json],
            )
            .map(|_| ())
            .map_err(|error| error.to_string())
    }

    #[cfg(test)]
    fn table_exists(&self, table_name: &str) -> Result<bool, String> {
        self.connection
            .query_row(
                "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?1",
                [table_name],
                |_| Ok(true),
            )
            .optional()
            .map(|value| value.unwrap_or(false))
            .map_err(|error| error.to_string())
    }

    #[cfg(test)]
    pub(crate) fn contains_plaintext(&self, text: &str) -> Result<bool, String> {
        use rusqlite::params_from_iter;

        let pattern = format!("%{text}%");

        for (table_name, columns) in [
            ("settings", &["value_json"][..]),
            (
                "provider_metadata",
                &[
                    "provider_id",
                    "provider_kind",
                    "display_name",
                    "auth_status",
                    "secret_ref",
                    "metadata_json",
                ][..],
            ),
            (
                "task_metadata",
                &["task_id", "title", "status", "metadata_json"][..],
            ),
            (
                "memory_metadata",
                &["memory_id", "summary", "source_kind", "metadata_json"][..],
            ),
            (
                "capability_metadata",
                &["capability_id", "capability_kind", "metadata_json"][..],
            ),
            (
                "audit_history",
                &["category", "action", "metadata_json"][..],
            ),
            ("user_preferences", &["key", "value_json"][..]),
        ] {
            let predicates = columns
                .iter()
                .map(|column| format!("COALESCE({column}, '') LIKE ?"))
                .collect::<Vec<_>>()
                .join(" OR ");
            let query = format!("SELECT EXISTS (SELECT 1 FROM {table_name} WHERE {predicates})");
            let values = std::iter::repeat_n(pattern.as_str(), columns.len());
            let found = self
                .connection
                .query_row(&query, params_from_iter(values), |row| {
                    row.get::<_, bool>(0)
                })
                .map_err(|error| error.to_string())?;

            if found {
                return Ok(true);
            }
        }

        Ok(false)
    }

    #[cfg(test)]
    pub(crate) fn fail_provider_metadata_writes(&self) -> Result<(), String> {
        self.connection
            .execute_batch(
                "
                CREATE TRIGGER fail_provider_metadata_writes
                BEFORE INSERT ON provider_metadata
                BEGIN
                    SELECT RAISE(FAIL, 'forced provider metadata failure');
                END;

                CREATE TRIGGER fail_provider_metadata_updates
                BEFORE UPDATE ON provider_metadata
                BEGIN
                    SELECT RAISE(FAIL, 'forced provider metadata failure');
                END;
                ",
            )
            .map_err(|error| error.to_string())
    }
}

fn encode_json(value: &impl Serialize) -> Result<String, String> {
    serde_json::to_string(value).map_err(|error| error.to_string())
}

fn decode_json<T: DeserializeOwned>(value: &str) -> Result<T, String> {
    serde_json::from_str(value).map_err(|error| error.to_string())
}

pub(crate) fn validate_provider_metadata(value: &Value) -> Result<(), String> {
    reject_secret_material(value)
}

fn reject_secret_material(value: &Value) -> Result<(), String> {
    match value {
        Value::Object(entries) => {
            for (key, value) in entries {
                let normalized_key = key.to_ascii_lowercase();
                if [
                    "secret",
                    "credential",
                    "password",
                    "api_key",
                    "apikey",
                    "access_token",
                    "refresh_token",
                    "token",
                ]
                .iter()
                .any(|blocked| normalized_key.contains(blocked))
                {
                    return Err(format!(
                        "provider metadata must not include secret material in `{key}`"
                    ));
                }

                reject_secret_material(value)?;
            }

            Ok(())
        }
        Value::Array(values) => {
            for value in values {
                reject_secret_material(value)?;
            }

            Ok(())
        }
        _ => Ok(()),
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    fn test_settings() -> CompanionSettings {
        CompanionSettings {
            companion_name: "Plato".to_string(),
            wake_name: "Plato".to_string(),
            launch_behavior: "launch-at-login".to_string(),
            memory_mode: "enabled".to_string(),
            execution_authority: "ask-first".to_string(),
            provider_placeholder: "openai-api-key".to_string(),
            onboarding_complete: true,
        }
    }

    fn temp_legacy_settings_path() -> std::path::PathBuf {
        let unique_name = format!(
            "useplatoai-legacy-settings-{}-{}.json",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system time after unix epoch")
                .as_nanos()
        );

        std::env::temp_dir().join(unique_name)
    }

    #[test]
    fn creates_local_data_schema_boundaries() {
        let service = LocalDataService::in_memory().expect("create in-memory service");

        for table_name in [
            "settings",
            "provider_metadata",
            "task_metadata",
            "memory_metadata",
            "capability_metadata",
            "audit_history",
            "user_preferences",
        ] {
            assert!(
                service.table_exists(table_name).expect("query schema"),
                "missing table {table_name}"
            );
        }
    }

    #[test]
    fn creates_reads_and_updates_settings_provider_and_task_metadata() {
        let service = LocalDataService::in_memory().expect("create in-memory service");

        let mut settings = test_settings();
        service
            .save_companion_settings(&settings)
            .expect("save settings");
        assert_eq!(
            service
                .read_companion_settings()
                .expect("read settings")
                .expect("settings row"),
            settings
        );

        settings.memory_mode = "paused".to_string();
        service
            .save_companion_settings(&settings)
            .expect("update settings");
        assert_eq!(
            service
                .read_companion_settings()
                .expect("read updated settings")
                .expect("settings row")
                .memory_mode,
            "paused"
        );

        let provider = ProviderMetadata {
            provider_id: "openai".to_string(),
            provider_kind: "model-provider".to_string(),
            display_name: "OpenAI".to_string(),
            auth_status: "needs-secret".to_string(),
            secret_ref: Some("keychain://useplatoai/provider/openai".to_string()),
            metadata: json!({ "configuredBy": "onboarding", "engine": "codex" }),
        };
        service
            .upsert_provider_metadata(&provider)
            .expect("save provider metadata");
        assert_eq!(
            service
                .read_provider_metadata("openai")
                .expect("read provider metadata"),
            Some(provider)
        );

        let task = TaskMetadata {
            task_id: "task-1".to_string(),
            title: "Verify local data service".to_string(),
            status: "running".to_string(),
            metadata: json!({ "source": "test" }),
        };
        service
            .upsert_task_metadata(&task)
            .expect("save task metadata");
        assert_eq!(
            service
                .read_task_metadata("task-1")
                .expect("read task metadata"),
            Some(task)
        );
    }

    #[test]
    fn imports_legacy_json_companion_settings_when_sqlite_is_empty() {
        let service = LocalDataService::in_memory().expect("create in-memory service");
        let settings = test_settings();
        let legacy_path = temp_legacy_settings_path();
        let legacy_settings_json =
            serde_json::to_string_pretty(&settings).expect("encode legacy settings");

        std::fs::write(&legacy_path, legacy_settings_json).expect("write legacy settings");

        assert_eq!(
            service
                .read_or_import_legacy_companion_settings(&legacy_path)
                .expect("import legacy settings"),
            Some(settings.clone())
        );
        assert_eq!(
            service
                .read_companion_settings()
                .expect("read imported settings"),
            Some(settings)
        );

        std::fs::remove_file(legacy_path).expect("remove legacy settings");
    }

    #[test]
    fn keeps_existing_sqlite_companion_settings_over_legacy_json() {
        let service = LocalDataService::in_memory().expect("create in-memory service");
        let mut existing_settings = test_settings();
        existing_settings.memory_mode = "paused".to_string();
        let legacy_settings = test_settings();
        let legacy_path = temp_legacy_settings_path();
        let legacy_settings_json =
            serde_json::to_string_pretty(&legacy_settings).expect("encode legacy settings");

        service
            .save_companion_settings(&existing_settings)
            .expect("save existing sqlite settings");
        std::fs::write(&legacy_path, legacy_settings_json).expect("write legacy settings");

        assert_eq!(
            service
                .read_or_import_legacy_companion_settings(&legacy_path)
                .expect("read existing settings"),
            Some(existing_settings.clone())
        );
        assert_eq!(
            service
                .read_companion_settings()
                .expect("read unchanged settings"),
            Some(existing_settings)
        );

        std::fs::remove_file(legacy_path).expect("remove legacy settings");
    }

    #[test]
    fn rejects_provider_metadata_that_contains_secret_material() {
        let service = LocalDataService::in_memory().expect("create in-memory service");
        let provider = ProviderMetadata {
            provider_id: "openai".to_string(),
            provider_kind: "model-provider".to_string(),
            display_name: "OpenAI".to_string(),
            auth_status: "configured".to_string(),
            secret_ref: None,
            metadata: json!({ "api_key": "should-not-live-here" }),
        };

        assert!(service.upsert_provider_metadata(&provider).is_err());
        assert_eq!(
            service
                .read_provider_metadata("openai")
                .expect("read provider metadata"),
            None
        );
    }
}
