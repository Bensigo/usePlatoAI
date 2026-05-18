#![cfg_attr(not(test), allow(dead_code))]

use std::{io::ErrorKind, path::Path};

use rusqlite::{params, Connection, OptionalExtension, Transaction, TransactionBehavior};
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use serde_json::{json, Value};

use crate::CompanionSettings;

const COMPANION_SETTINGS_KEY: &str = "companion";
const DEFAULT_EXECUTION_AUTHORITY: ExecutionAuthorityMode = ExecutionAuthorityMode::AskFirst;

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

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum LocalMemoryKind {
    Summary,
    Preference,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalMemoryInput {
    pub memory_id: String,
    pub memory_kind: LocalMemoryKind,
    pub summary: String,
    pub preference_key: Option<String>,
    pub preference_value: Option<Value>,
    pub source_kind: String,
    pub metadata: Value,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalMemoryRecord {
    pub memory_id: String,
    pub memory_kind: LocalMemoryKind,
    pub summary: String,
    pub preference_key: Option<String>,
    pub preference_value: Option<Value>,
    pub source_kind: String,
    pub metadata: Value,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalMemoryRetrievalQuery {
    pub query: Option<String>,
    pub memory_kind: Option<LocalMemoryKind>,
    pub limit: Option<u32>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditHistoryEntry {
    pub audit_id: i64,
    pub category: String,
    pub action: String,
    pub metadata: Value,
    pub created_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalDataCategoryStatus {
    pub category_id: String,
    pub label: String,
    pub storage: String,
    pub record_count: i64,
    pub status: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryStatus {
    pub mode: String,
    pub record_count: i64,
    pub intelligence_status: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalDataOverview {
    pub categories: Vec<LocalDataCategoryStatus>,
    pub memory_status: MemoryStatus,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum ExecutionAuthorityMode {
    AskFirst,
    TrustedLocal,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum ActionImpact {
    LowRiskLocal,
    LocalFileChange,
    AppControl,
    ExternalMessage,
    BrowserSubmission,
    DestructiveChange,
    Spending,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum PolicyDecision {
    Proceed,
    Warn,
    Ask,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecutionAuthorityPolicy {
    pub mode: ExecutionAuthorityMode,
    pub low_risk_local: PolicyDecision,
    pub local_file_change: PolicyDecision,
    pub app_control: PolicyDecision,
    pub external_message: PolicyDecision,
    pub browser_submission: PolicyDecision,
    pub destructive_change: PolicyDecision,
    pub spending: PolicyDecision,
}

impl ExecutionAuthorityPolicy {
    fn for_mode(mode: ExecutionAuthorityMode) -> Self {
        match mode {
            ExecutionAuthorityMode::AskFirst => Self {
                mode,
                low_risk_local: PolicyDecision::Proceed,
                local_file_change: PolicyDecision::Ask,
                app_control: PolicyDecision::Ask,
                external_message: PolicyDecision::Ask,
                browser_submission: PolicyDecision::Ask,
                destructive_change: PolicyDecision::Ask,
                spending: PolicyDecision::Ask,
            },
            ExecutionAuthorityMode::TrustedLocal => Self {
                mode,
                low_risk_local: PolicyDecision::Proceed,
                local_file_change: PolicyDecision::Warn,
                app_control: PolicyDecision::Warn,
                external_message: PolicyDecision::Ask,
                browser_submission: PolicyDecision::Ask,
                destructive_change: PolicyDecision::Ask,
                spending: PolicyDecision::Ask,
            },
        }
    }

    pub fn decision_for(&self, impact: ActionImpact) -> PolicyDecision {
        match impact {
            ActionImpact::LowRiskLocal => self.low_risk_local,
            ActionImpact::LocalFileChange => self.local_file_change,
            ActionImpact::AppControl => self.app_control,
            ActionImpact::ExternalMessage => self.external_message,
            ActionImpact::BrowserSubmission => self.browser_submission,
            ActionImpact::DestructiveChange => self.destructive_change,
            ActionImpact::Spending => self.spending,
        }
    }
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
                    memory_kind TEXT NOT NULL DEFAULT 'summary',
                    summary TEXT NOT NULL,
                    preference_key TEXT,
                    preference_value_json TEXT,
                    source_kind TEXT NOT NULL,
                    metadata_json TEXT NOT NULL DEFAULT '{}',
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
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
            .map_err(|error| error.to_string())?;

        self.migrate_memory_metadata_columns()
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
        let next_authority_mode = parse_execution_authority_mode(&settings.execution_authority)?;
        let settings_json = encode_json(settings)?;

        let transaction =
            Transaction::new_unchecked(&self.connection, TransactionBehavior::Immediate)
                .map_err(|error| error.to_string())?;

        let previous_settings = transaction
            .query_row(
                "SELECT value_json FROM settings WHERE key = ?1",
                [COMPANION_SETTINGS_KEY],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .map_err(|error| error.to_string())?
            .map(|settings_json| decode_json::<CompanionSettings>(&settings_json))
            .transpose()?;
        let previous_authority_mode = previous_settings
            .as_ref()
            .map(|settings| parse_execution_authority_mode(&settings.execution_authority))
            .transpose()?
            .unwrap_or(DEFAULT_EXECUTION_AUTHORITY);

        transaction
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

        let settings_audit_metadata = encode_json(&settings_audit_metadata(
            previous_settings.as_ref(),
            settings,
        ))?;
        transaction
            .execute(
                "
                INSERT INTO audit_history (category, action, metadata_json)
                VALUES (?1, ?2, ?3)
                ",
                params![
                    "settings",
                    "companion_settings.saved",
                    settings_audit_metadata
                ],
            )
            .map_err(|error| error.to_string())?;

        if previous_authority_mode != next_authority_mode {
            let permissions_audit_metadata = encode_json(&json!({
                "settingKey": "executionAuthority",
                "previousMode": execution_authority_mode_key(previous_authority_mode),
                "newMode": execution_authority_mode_key(next_authority_mode),
            }))?;
            transaction
                .execute(
                    "
                    INSERT INTO audit_history (category, action, metadata_json)
                    VALUES (?1, ?2, ?3)
                    ",
                    params![
                        "permissions",
                        "execution_authority.changed",
                        permissions_audit_metadata
                    ],
                )
                .map_err(|error| error.to_string())?;
        }

        transaction.commit().map_err(|error| error.to_string())
    }

    pub fn read_execution_authority_policy(&self) -> Result<ExecutionAuthorityPolicy, String> {
        let mode = self
            .read_companion_settings()?
            .map(|settings| parse_execution_authority_mode(&settings.execution_authority))
            .transpose()?
            .unwrap_or(DEFAULT_EXECUTION_AUTHORITY);

        Ok(ExecutionAuthorityPolicy::for_mode(mode))
    }

    pub fn read_or_import_legacy_execution_authority_policy(
        &self,
        legacy_settings_path: impl AsRef<Path>,
    ) -> Result<ExecutionAuthorityPolicy, String> {
        let mode = self
            .read_or_import_legacy_companion_settings(legacy_settings_path)?
            .map(|settings| parse_execution_authority_mode(&settings.execution_authority))
            .transpose()?
            .unwrap_or(DEFAULT_EXECUTION_AUTHORITY);

        Ok(ExecutionAuthorityPolicy::for_mode(mode))
    }

    pub fn save_execution_authority_mode(
        &self,
        mode: ExecutionAuthorityMode,
    ) -> Result<(), String> {
        let mut settings = self
            .read_companion_settings()?
            .unwrap_or_else(default_companion_settings);
        settings.execution_authority = execution_authority_mode_key(mode).to_string();

        self.save_companion_settings(&settings)
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

    pub fn upsert_memory_record(
        &self,
        memory: &LocalMemoryInput,
    ) -> Result<LocalMemoryRecord, String> {
        validate_memory_input(memory)?;

        let memory_kind = memory_kind_key(memory.memory_kind);
        let preference_value_json = memory
            .preference_value
            .as_ref()
            .map(encode_json)
            .transpose()?;
        let metadata_json = encode_json(&memory.metadata)?;

        self.connection
            .execute(
                "
                INSERT INTO memory_metadata (
                    memory_id,
                    memory_kind,
                    summary,
                    preference_key,
                    preference_value_json,
                    source_kind,
                    metadata_json,
                    created_at,
                    updated_at
                )
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                ON CONFLICT(memory_id) DO UPDATE SET
                    memory_kind = excluded.memory_kind,
                    summary = excluded.summary,
                    preference_key = excluded.preference_key,
                    preference_value_json = excluded.preference_value_json,
                    source_kind = excluded.source_kind,
                    metadata_json = excluded.metadata_json,
                    updated_at = excluded.updated_at
                ",
                params![
                    memory.memory_id,
                    memory_kind,
                    memory.summary,
                    memory.preference_key,
                    preference_value_json,
                    memory.source_kind,
                    metadata_json
                ],
            )
            .map_err(|error| error.to_string())?;

        self.record_audit_entry(
            "memory",
            "memory.upserted",
            json!({
                "memoryId": memory.memory_id,
                "memoryKind": memory_kind,
                "sourceKind": memory.source_kind,
            }),
        )?;

        self.read_memory_record(&memory.memory_id)?
            .ok_or_else(|| format!("memory record `{}` was not persisted", memory.memory_id))
    }

    pub fn read_memory_record(&self, memory_id: &str) -> Result<Option<LocalMemoryRecord>, String> {
        self.connection
            .query_row(
                "
                SELECT
                    memory_id,
                    memory_kind,
                    summary,
                    preference_key,
                    preference_value_json,
                    source_kind,
                    metadata_json,
                    created_at,
                    updated_at
                FROM memory_metadata
                WHERE memory_id = ?1
                ",
                [memory_id],
                memory_record_from_row,
            )
            .optional()
            .map_err(|error| error.to_string())
    }

    pub fn read_memory_preference(
        &self,
        preference_key: &str,
    ) -> Result<Option<LocalMemoryRecord>, String> {
        self.connection
            .query_row(
                "
                SELECT
                    memory_id,
                    memory_kind,
                    summary,
                    preference_key,
                    preference_value_json,
                    source_kind,
                    metadata_json,
                    created_at,
                    updated_at
                FROM memory_metadata
                WHERE memory_kind = 'preference' AND preference_key = ?1
                ORDER BY updated_at DESC, memory_id DESC
                LIMIT 1
                ",
                [preference_key],
                memory_record_from_row,
            )
            .optional()
            .map_err(|error| error.to_string())
    }

    pub fn retrieve_memory_records(
        &self,
        query: &LocalMemoryRetrievalQuery,
    ) -> Result<Vec<LocalMemoryRecord>, String> {
        let limit = query.limit.unwrap_or(10).clamp(1, 50);
        let mut where_clauses = Vec::new();
        let mut values = Vec::new();

        if let Some(kind) = query.memory_kind {
            where_clauses.push("memory_kind = ?".to_string());
            values.push(memory_kind_key(kind).to_string());
        }

        if let Some(text_query) = query.query.as_ref().map(|value| value.trim()) {
            if !text_query.is_empty() {
                where_clauses.push(
                    "(summary LIKE ? OR COALESCE(preference_key, '') LIKE ? OR COALESCE(preference_value_json, '') LIKE ?)".to_string(),
                );
                let pattern = format!("%{text_query}%");
                values.push(pattern.clone());
                values.push(pattern.clone());
                values.push(pattern);
            }
        }

        let filter_sql = if where_clauses.is_empty() {
            String::new()
        } else {
            format!("WHERE {}", where_clauses.join(" AND "))
        };
        let sql = format!(
            "
            SELECT
                memory_id,
                memory_kind,
                summary,
                preference_key,
                preference_value_json,
                source_kind,
                metadata_json,
                created_at,
                updated_at
            FROM memory_metadata
            {filter_sql}
            ORDER BY updated_at DESC, memory_id DESC
            LIMIT {limit}
            "
        );

        let mut statement = self
            .connection
            .prepare(&sql)
            .map_err(|error| error.to_string())?;
        let records = statement
            .query_map(
                rusqlite::params_from_iter(values.iter()),
                memory_record_from_row,
            )
            .map_err(|error| error.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| error.to_string())?;

        Ok(records)
    }

    pub fn read_recent_audit_history(&self, limit: u32) -> Result<Vec<AuditHistoryEntry>, String> {
        let limit = limit.clamp(1, 100);
        let mut statement = self
            .connection
            .prepare(
                "
                SELECT audit_id, category, action, metadata_json, created_at
                FROM audit_history
                ORDER BY audit_id DESC
                LIMIT ?1
                ",
            )
            .map_err(|error| error.to_string())?;

        let entries = statement
            .query_map([limit], |row| {
                let metadata_json: String = row.get(3)?;
                let metadata = serde_json::from_str(&metadata_json).map_err(|error| {
                    rusqlite::Error::FromSqlConversionFailure(
                        3,
                        rusqlite::types::Type::Text,
                        Box::new(error),
                    )
                })?;

                Ok(AuditHistoryEntry {
                    audit_id: row.get(0)?,
                    category: row.get(1)?,
                    action: row.get(2)?,
                    metadata,
                    created_at: row.get(4)?,
                })
            })
            .map_err(|error| error.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| error.to_string())?;

        Ok(entries)
    }

    pub fn read_local_data_overview(&self) -> Result<LocalDataOverview, String> {
        let settings_count = self.count_table_rows("settings")?;
        let provider_count = self.count_table_rows("provider_metadata")?;
        let task_count = self.count_table_rows("task_metadata")?;
        let memory_count = self.count_table_rows("memory_metadata")?;
        let capability_count = self.count_table_rows("capability_metadata")?;
        let audit_count = self.count_table_rows("audit_history")?;
        let preference_count = self.count_table_rows("user_preferences")?;
        let settings = self
            .read_companion_settings()?
            .unwrap_or_else(default_companion_settings);

        Ok(LocalDataOverview {
            categories: vec![
                LocalDataCategoryStatus {
                    category_id: "settings".to_string(),
                    label: "Settings".to_string(),
                    storage: "SQLite settings".to_string(),
                    record_count: settings_count,
                    status: status_for_count(settings_count),
                },
                LocalDataCategoryStatus {
                    category_id: "secrets".to_string(),
                    label: "Secrets".to_string(),
                    storage: "OS-backed secret store".to_string(),
                    record_count: provider_count,
                    status: status_for_count(provider_count),
                },
                LocalDataCategoryStatus {
                    category_id: "memory".to_string(),
                    label: "Memory".to_string(),
                    storage: "SQLite memory metadata".to_string(),
                    record_count: memory_count,
                    status: status_for_count(memory_count),
                },
                LocalDataCategoryStatus {
                    category_id: "tasks".to_string(),
                    label: "Tasks".to_string(),
                    storage: "SQLite task metadata".to_string(),
                    record_count: task_count,
                    status: status_for_count(task_count),
                },
                LocalDataCategoryStatus {
                    category_id: "capabilities".to_string(),
                    label: "Capabilities".to_string(),
                    storage: "SQLite capability metadata".to_string(),
                    record_count: capability_count,
                    status: status_for_count(capability_count),
                },
                LocalDataCategoryStatus {
                    category_id: "provider-metadata".to_string(),
                    label: "Provider metadata".to_string(),
                    storage: "SQLite provider metadata".to_string(),
                    record_count: provider_count,
                    status: status_for_count(provider_count),
                },
                LocalDataCategoryStatus {
                    category_id: "permissions".to_string(),
                    label: "Permissions".to_string(),
                    storage: "SQLite settings policy".to_string(),
                    record_count: settings_count + preference_count,
                    status: settings.execution_authority,
                },
                LocalDataCategoryStatus {
                    category_id: "audit-history".to_string(),
                    label: "Audit/history".to_string(),
                    storage: "SQLite audit history".to_string(),
                    record_count: audit_count,
                    status: status_for_count(audit_count),
                },
            ],
            memory_status: MemoryStatus {
                mode: settings.memory_mode,
                record_count: memory_count,
                intelligence_status: "local-storage-boundary".to_string(),
            },
        })
    }

    fn count_table_rows(&self, table_name: &str) -> Result<i64, String> {
        let table_name = match table_name {
            "settings" => "settings",
            "provider_metadata" => "provider_metadata",
            "task_metadata" => "task_metadata",
            "memory_metadata" => "memory_metadata",
            "capability_metadata" => "capability_metadata",
            "audit_history" => "audit_history",
            "user_preferences" => "user_preferences",
            unknown => return Err(format!("unsupported local data table `{unknown}`")),
        };
        let query = format!("SELECT COUNT(*) FROM {table_name}");

        self.connection
            .query_row(&query, [], |row| row.get(0))
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

    fn migrate_memory_metadata_columns(&self) -> Result<(), String> {
        for (column_name, column_definition) in [
            ("memory_kind", "TEXT NOT NULL DEFAULT 'summary'"),
            ("preference_key", "TEXT"),
            ("preference_value_json", "TEXT"),
            ("created_at", "TEXT NOT NULL DEFAULT ''"),
        ] {
            if !self.table_column_exists("memory_metadata", column_name)? {
                self.connection
                    .execute(
                        &format!(
                            "ALTER TABLE memory_metadata ADD COLUMN {column_name} {column_definition}"
                        ),
                        [],
                    )
                    .map_err(|error| error.to_string())?;
            }
        }

        Ok(())
    }

    fn table_column_exists(&self, table_name: &str, column_name: &str) -> Result<bool, String> {
        let mut statement = self
            .connection
            .prepare(&format!("PRAGMA table_info({table_name})"))
            .map_err(|error| error.to_string())?;
        let columns = statement
            .query_map([], |row| row.get::<_, String>(1))
            .map_err(|error| error.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| error.to_string())?;

        Ok(columns.iter().any(|column| column == column_name))
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

    #[cfg(test)]
    pub(crate) fn fail_audit_history_writes(&self) -> Result<(), String> {
        self.connection
            .execute_batch(
                "
                CREATE TRIGGER fail_audit_history_writes
                BEFORE INSERT ON audit_history
                BEGIN
                    SELECT RAISE(FAIL, 'forced audit history failure');
                END;
                ",
            )
            .map_err(|error| error.to_string())
    }

    #[cfg(test)]
    pub(crate) fn insert_legacy_provider_metadata_for_test(
        &self,
        provider: &ProviderMetadata,
    ) -> Result<(), String> {
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
            .map(|_| ())
            .map_err(|error| error.to_string())
    }
}

fn encode_json(value: &impl Serialize) -> Result<String, String> {
    serde_json::to_string(value).map_err(|error| error.to_string())
}

fn decode_json<T: DeserializeOwned>(value: &str) -> Result<T, String> {
    serde_json::from_str(value).map_err(|error| error.to_string())
}

fn default_companion_settings() -> CompanionSettings {
    CompanionSettings {
        companion_name: "Plato".to_string(),
        wake_name: "Plato".to_string(),
        launch_behavior: "launch-at-login".to_string(),
        memory_mode: "enabled".to_string(),
        execution_authority: execution_authority_mode_key(DEFAULT_EXECUTION_AUTHORITY).to_string(),
        provider_placeholder: "configure-later".to_string(),
        onboarding_complete: false,
    }
}

fn execution_authority_mode_key(mode: ExecutionAuthorityMode) -> &'static str {
    match mode {
        ExecutionAuthorityMode::AskFirst => "ask-first",
        ExecutionAuthorityMode::TrustedLocal => "trusted-local",
    }
}

fn parse_execution_authority_mode(value: &str) -> Result<ExecutionAuthorityMode, String> {
    match value {
        "ask-first" => Ok(ExecutionAuthorityMode::AskFirst),
        "trusted-local" => Ok(ExecutionAuthorityMode::TrustedLocal),
        unknown => Err(format!("unknown execution authority mode `{unknown}`")),
    }
}

fn settings_audit_metadata(
    previous_settings: Option<&CompanionSettings>,
    next_settings: &CompanionSettings,
) -> Value {
    let baseline = previous_settings
        .cloned()
        .unwrap_or_else(default_companion_settings);
    let mut changed_fields = Vec::new();

    if baseline.companion_name != next_settings.companion_name {
        changed_fields.push("companionName");
    }
    if baseline.wake_name != next_settings.wake_name {
        changed_fields.push("wakeName");
    }
    if baseline.launch_behavior != next_settings.launch_behavior {
        changed_fields.push("launchBehavior");
    }
    if baseline.memory_mode != next_settings.memory_mode {
        changed_fields.push("memoryMode");
    }
    if baseline.execution_authority != next_settings.execution_authority {
        changed_fields.push("executionAuthority");
    }
    if baseline.provider_placeholder != next_settings.provider_placeholder {
        changed_fields.push("providerPlaceholder");
    }
    if baseline.onboarding_complete != next_settings.onboarding_complete {
        changed_fields.push("onboardingComplete");
    }

    json!({
        "settingKey": COMPANION_SETTINGS_KEY,
        "changedFields": changed_fields,
    })
}

fn status_for_count(count: i64) -> String {
    if count > 0 {
        "active".to_string()
    } else {
        "empty".to_string()
    }
}

fn memory_kind_key(kind: LocalMemoryKind) -> &'static str {
    match kind {
        LocalMemoryKind::Summary => "summary",
        LocalMemoryKind::Preference => "preference",
    }
}

fn parse_memory_kind(value: &str) -> Result<LocalMemoryKind, String> {
    match value {
        "summary" => Ok(LocalMemoryKind::Summary),
        "preference" => Ok(LocalMemoryKind::Preference),
        unknown => Err(format!("unknown memory kind `{unknown}`")),
    }
}

fn memory_record_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<LocalMemoryRecord> {
    let memory_kind: String = row.get(1)?;
    let preference_value_json: Option<String> = row.get(4)?;
    let metadata_json: String = row.get(6)?;
    let memory_kind = parse_memory_kind(&memory_kind).map_err(|error| {
        rusqlite::Error::FromSqlConversionFailure(
            1,
            rusqlite::types::Type::Text,
            Box::new(std::io::Error::new(std::io::ErrorKind::InvalidData, error)),
        )
    })?;
    let preference_value = preference_value_json
        .map(|value| {
            serde_json::from_str(&value).map_err(|error| {
                rusqlite::Error::FromSqlConversionFailure(
                    4,
                    rusqlite::types::Type::Text,
                    Box::new(error),
                )
            })
        })
        .transpose()?;
    let metadata = serde_json::from_str(&metadata_json).map_err(|error| {
        rusqlite::Error::FromSqlConversionFailure(6, rusqlite::types::Type::Text, Box::new(error))
    })?;

    Ok(LocalMemoryRecord {
        memory_id: row.get(0)?,
        memory_kind,
        summary: row.get(2)?,
        preference_key: row.get(3)?,
        preference_value,
        source_kind: row.get(5)?,
        metadata,
        created_at: row.get(7)?,
        updated_at: row.get(8)?,
    })
}

fn validate_memory_input(memory: &LocalMemoryInput) -> Result<(), String> {
    if memory.memory_id.trim().is_empty() {
        return Err("memory id is required".to_string());
    }
    if memory.summary.trim().is_empty() {
        return Err("memory summary is required".to_string());
    }
    reject_raw_transcript_text("summary", &memory.summary)?;
    if memory.source_kind.trim().is_empty() {
        return Err("memory source kind is required".to_string());
    }
    reject_raw_transcript_material(&memory.metadata)?;
    if let Some(preference_value) = &memory.preference_value {
        reject_raw_transcript_material(preference_value)?;
    }

    match memory.memory_kind {
        LocalMemoryKind::Summary => {
            if memory.preference_key.is_some() || memory.preference_value.is_some() {
                return Err("summary memory must not include preference fields".to_string());
            }
        }
        LocalMemoryKind::Preference => {
            if memory
                .preference_key
                .as_ref()
                .map(|key| key.trim().is_empty())
                .unwrap_or(true)
            {
                return Err("preference memory requires a preference key".to_string());
            }
            if memory.preference_value.is_none() {
                return Err("preference memory requires a preference value".to_string());
            }
        }
    }

    Ok(())
}

pub(crate) fn validate_provider_metadata(value: &Value) -> Result<(), String> {
    reject_secret_material(value)
}

fn reject_raw_transcript_material(value: &Value) -> Result<(), String> {
    match value {
        Value::Object(entries) => {
            for (key, value) in entries {
                if is_raw_transcript_field_name(key) {
                    return Err(format!(
                        "memory payload must not include raw transcript material in `{key}`"
                    ));
                }

                reject_raw_transcript_material(value)?;
            }

            Ok(())
        }
        Value::Array(values) => {
            for value in values {
                reject_raw_transcript_material(value)?;
            }

            Ok(())
        }
        Value::String(value) => reject_raw_transcript_text("value", value),
        _ => Ok(()),
    }
}

fn is_raw_transcript_field_name(key: &str) -> bool {
    let normalized_key = key
        .chars()
        .filter(|character| character.is_ascii_alphanumeric())
        .collect::<String>()
        .to_ascii_lowercase();

    [
        "transcript",
        "rawtranscript",
        "conversation",
        "conversationlog",
        "fullconversation",
        "messages",
        "rawmessages",
        "messagelog",
        "turns",
        "content",
    ]
    .contains(&normalized_key.as_str())
}

fn reject_raw_transcript_text(field_name: &str, value: &str) -> Result<(), String> {
    if looks_like_raw_transcript_text(value) {
        return Err(format!(
            "memory payload must not include raw transcript material in `{field_name}`"
        ));
    }

    Ok(())
}

fn looks_like_raw_transcript_text(value: &str) -> bool {
    let lower = value.trim().to_ascii_lowercase();

    if lower.is_empty() {
        return false;
    }

    let speaker_markers = ["user:", "assistant:", "system:", "plato:"];
    let marker_count = speaker_markers
        .iter()
        .filter(|marker| lower.starts_with(**marker) || lower.contains(&format!("\n{marker}")))
        .count();

    marker_count >= 2 || (marker_count >= 1 && lower.lines().count() >= 2)
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
        Value::String(value) => {
            if looks_like_secret_value(value) {
                return Err("provider metadata must not include secret-looking values".to_string());
            }

            Ok(())
        }
        _ => Ok(()),
    }
}

fn looks_like_secret_value(value: &str) -> bool {
    let trimmed = value.trim();
    let lower = trimmed.to_ascii_lowercase();

    if lower.len() >= 20
        && [
            "sk-", "sk_ant_", "sk-ant-", "ghp_", "gho_", "ghu_", "ghs_", "ghr_", "xoxb-", "xoxp-",
            "xoxa-",
        ]
        .iter()
        .any(|prefix| lower.starts_with(prefix))
    {
        return true;
    }

    trimmed.len() >= 40 && trimmed.starts_with("eyJ") && trimmed.matches('.').count() == 2
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

    fn temp_local_data_path() -> std::path::PathBuf {
        let unique_name = format!(
            "useplatoai-local-data-{}-{}.sqlite",
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
    fn creates_reads_and_retrieves_summary_and_preference_memory() {
        let service = LocalDataService::in_memory().expect("create in-memory service");
        let summary_memory = LocalMemoryInput {
            memory_id: "memory-summary-1".to_string(),
            memory_kind: LocalMemoryKind::Summary,
            summary: "User prefers direct implementation notes over generic advice.".to_string(),
            preference_key: None,
            preference_value: None,
            source_kind: "conversation-summary".to_string(),
            metadata: json!({ "extractor": "local-test-boundary" }),
        };
        let preference_memory = LocalMemoryInput {
            memory_id: "memory-preference-1".to_string(),
            memory_kind: LocalMemoryKind::Preference,
            summary: "User wants verification notes in every implementation PR.".to_string(),
            preference_key: Some("pr.verification_notes".to_string()),
            preference_value: Some(json!(true)),
            source_kind: "user-approved-preference".to_string(),
            metadata: json!({ "extractor": "local-test-boundary" }),
        };

        let saved_summary = service
            .upsert_memory_record(&summary_memory)
            .expect("save summary memory");
        let saved_preference = service
            .upsert_memory_record(&preference_memory)
            .expect("save preference memory");

        assert_eq!(saved_summary.memory_kind, LocalMemoryKind::Summary);
        assert_eq!(saved_preference.memory_kind, LocalMemoryKind::Preference);
        assert_eq!(
            service
                .read_memory_record("memory-summary-1")
                .expect("read summary memory")
                .expect("summary memory")
                .summary,
            summary_memory.summary
        );
        assert_eq!(
            service
                .read_memory_preference("pr.verification_notes")
                .expect("read preference")
                .expect("preference")
                .preference_value,
            Some(json!(true))
        );

        let retrieved = service
            .retrieve_memory_records(&LocalMemoryRetrievalQuery {
                query: Some("verification".to_string()),
                memory_kind: Some(LocalMemoryKind::Preference),
                limit: Some(5),
            })
            .expect("retrieve memories");

        assert_eq!(retrieved, vec![saved_preference]);
    }

    #[test]
    fn memory_writes_reject_raw_transcript_metadata() {
        let service = LocalDataService::in_memory().expect("create in-memory service");
        let raw_transcript = "User: keep this exact transcript out of durable memory";
        let memory = LocalMemoryInput {
            memory_id: "memory-raw-transcript".to_string(),
            memory_kind: LocalMemoryKind::Summary,
            summary: "User prefers not to store raw transcripts.".to_string(),
            preference_key: None,
            preference_value: None,
            source_kind: "conversation-summary".to_string(),
            metadata: json!({ "rawTranscript": raw_transcript }),
        };

        let error = service
            .upsert_memory_record(&memory)
            .expect_err("raw transcripts are rejected");

        assert!(error.contains("raw transcript"));
        assert_eq!(
            service
                .read_memory_record("memory-raw-transcript")
                .expect("read rejected memory"),
            None
        );
        assert!(!service
            .contains_plaintext(raw_transcript)
            .expect("scan persisted local data"));
    }

    #[test]
    fn memory_writes_reject_message_shaped_metadata() {
        let service = LocalDataService::in_memory().expect("create in-memory service");
        let raw_turn = "Assistant: exact response that should not be stored";
        let memory = LocalMemoryInput {
            memory_id: "memory-messages".to_string(),
            memory_kind: LocalMemoryKind::Summary,
            summary: "User prefers short implementation updates.".to_string(),
            preference_key: None,
            preference_value: None,
            source_kind: "conversation-summary".to_string(),
            metadata: json!({
                "messages": [
                    { "role": "user", "content": "Keep this transcript out" },
                    { "role": "assistant", "content": raw_turn }
                ]
            }),
        };

        let error = service
            .upsert_memory_record(&memory)
            .expect_err("message-shaped metadata is rejected");

        assert!(error.contains("raw transcript"));
        assert_eq!(
            service
                .read_memory_record("memory-messages")
                .expect("read rejected memory"),
            None
        );
        assert!(!service
            .contains_plaintext(raw_turn)
            .expect("scan persisted local data"));
    }

    #[test]
    fn memory_writes_reject_raw_transcripts_in_preference_value() {
        let service = LocalDataService::in_memory().expect("create in-memory service");
        let raw_transcript = "User: store my preference\nAssistant: I will remember that";
        let memory = LocalMemoryInput {
            memory_id: "memory-preference-transcript".to_string(),
            memory_kind: LocalMemoryKind::Preference,
            summary: "User prefers concise status updates.".to_string(),
            preference_key: Some("communication.status_updates".to_string()),
            preference_value: Some(json!({ "value": raw_transcript })),
            source_kind: "user-approved-preference".to_string(),
            metadata: json!({ "extractor": "local-test-boundary" }),
        };

        let error = service
            .upsert_memory_record(&memory)
            .expect_err("raw transcripts in preference values are rejected");

        assert!(error.contains("raw transcript"));
        assert_eq!(
            service
                .read_memory_record("memory-preference-transcript")
                .expect("read rejected memory"),
            None
        );
        assert!(!service
            .contains_plaintext(raw_transcript)
            .expect("scan persisted local data"));
    }

    #[test]
    fn memory_writes_reject_raw_transcript_summaries() {
        let service = LocalDataService::in_memory().expect("create in-memory service");
        let raw_summary = "User: keep this exact line\nAssistant: this is a raw reply";
        let memory = LocalMemoryInput {
            memory_id: "memory-summary-transcript".to_string(),
            memory_kind: LocalMemoryKind::Summary,
            summary: raw_summary.to_string(),
            preference_key: None,
            preference_value: None,
            source_kind: "conversation-summary".to_string(),
            metadata: json!({ "extractor": "local-test-boundary" }),
        };

        let error = service
            .upsert_memory_record(&memory)
            .expect_err("raw transcript summaries are rejected");

        assert!(error.contains("raw transcript"));
        assert_eq!(
            service
                .read_memory_record("memory-summary-transcript")
                .expect("read rejected memory"),
            None
        );
        assert!(!service
            .contains_plaintext(raw_summary)
            .expect("scan persisted local data"));
    }

    #[test]
    fn memory_boundary_validates_summary_and_preference_shapes() {
        let service = LocalDataService::in_memory().expect("create in-memory service");
        let missing_summary = LocalMemoryInput {
            memory_id: "memory-missing-summary".to_string(),
            memory_kind: LocalMemoryKind::Summary,
            summary: " ".to_string(),
            preference_key: None,
            preference_value: None,
            source_kind: "conversation-summary".to_string(),
            metadata: json!({}),
        };
        let incomplete_preference = LocalMemoryInput {
            memory_id: "memory-incomplete-preference".to_string(),
            memory_kind: LocalMemoryKind::Preference,
            summary: "User prefers concise replies.".to_string(),
            preference_key: Some("communication.concise".to_string()),
            preference_value: None,
            source_kind: "user-approved-preference".to_string(),
            metadata: json!({}),
        };

        assert!(service.upsert_memory_record(&missing_summary).is_err());
        assert!(service
            .upsert_memory_record(&incomplete_preference)
            .is_err());
    }

    #[test]
    fn records_recent_audit_history_for_settings_changes() {
        let service = LocalDataService::in_memory().expect("create in-memory service");
        let mut settings = test_settings();
        settings.memory_mode = "paused".to_string();
        settings.provider_placeholder = "sk-test-secret-that-must-not-be-recorded".to_string();

        service
            .save_companion_settings(&settings)
            .expect("save settings");

        let audit_entries = service
            .read_recent_audit_history(5)
            .expect("read audit history");
        let entry = audit_entries
            .iter()
            .find(|entry| entry.action == "companion_settings.saved")
            .expect("settings audit entry");

        assert_eq!(entry.category, "settings");
        assert!(!entry.created_at.is_empty());
        assert_eq!(entry.metadata["settingKey"], "companion");
        assert_eq!(
            entry.metadata["changedFields"],
            json!(["memoryMode", "providerPlaceholder", "onboardingComplete"])
        );
        assert!(!entry
            .metadata
            .to_string()
            .contains("sk-test-secret-that-must-not-be-recorded"));
    }

    #[test]
    fn reports_local_data_categories_and_memory_status() {
        let service = LocalDataService::in_memory().expect("create in-memory service");
        let mut settings = test_settings();
        settings.memory_mode = "paused".to_string();

        service
            .save_companion_settings(&settings)
            .expect("save settings");
        service
            .upsert_provider_metadata(&ProviderMetadata {
                provider_id: "openai".to_string(),
                provider_kind: "model-provider".to_string(),
                display_name: "OpenAI".to_string(),
                auth_status: "configured".to_string(),
                secret_ref: Some("keychain://useplatoai/provider/openai".to_string()),
                metadata: json!({ "engine": "codex" }),
            })
            .expect("save provider metadata");

        let overview = service
            .read_local_data_overview()
            .expect("read local data overview");

        assert_eq!(
            overview
                .categories
                .iter()
                .map(|category| category.category_id.as_str())
                .collect::<Vec<_>>(),
            vec![
                "settings",
                "secrets",
                "memory",
                "tasks",
                "capabilities",
                "provider-metadata",
                "permissions",
                "audit-history"
            ]
        );
        assert_eq!(overview.memory_status.mode, "paused");
        assert_eq!(
            overview.memory_status.intelligence_status,
            "local-storage-boundary"
        );
        assert_eq!(
            overview
                .categories
                .iter()
                .find(|category| category.category_id == "secrets")
                .expect("secrets category")
                .record_count,
            1
        );
    }

    #[test]
    fn records_all_changed_companion_settings_fields_without_raw_values() {
        let service = LocalDataService::in_memory().expect("create in-memory service");
        let mut settings = default_companion_settings();
        settings.provider_placeholder = "openai-api-key".to_string();
        settings.onboarding_complete = true;

        service
            .save_companion_settings(&settings)
            .expect("save settings");

        let audit_entries = service
            .read_recent_audit_history(5)
            .expect("read audit history");
        let entry = audit_entries
            .iter()
            .find(|entry| entry.action == "companion_settings.saved")
            .expect("settings audit entry");

        assert_eq!(
            entry.metadata["changedFields"],
            json!(["providerPlaceholder", "onboardingComplete"])
        );
        assert!(!entry.metadata.to_string().contains("openai-api-key"));
    }

    #[test]
    fn records_recent_audit_history_for_execution_authority_changes() {
        let service = LocalDataService::in_memory().expect("create in-memory service");

        service
            .save_execution_authority_mode(ExecutionAuthorityMode::TrustedLocal)
            .expect("save trusted local mode");

        let audit_entries = service
            .read_recent_audit_history(5)
            .expect("read audit history");
        let entry = audit_entries
            .iter()
            .find(|entry| entry.action == "execution_authority.changed")
            .expect("execution authority audit entry");

        assert_eq!(entry.category, "permissions");
        assert!(!entry.created_at.is_empty());
        assert_eq!(entry.metadata["settingKey"], "executionAuthority");
        assert_eq!(entry.metadata["previousMode"], "ask-first");
        assert_eq!(entry.metadata["newMode"], "trusted-local");
    }

    #[test]
    fn records_permission_audit_when_settings_save_changes_execution_authority() {
        let service = LocalDataService::in_memory().expect("create in-memory service");
        let mut settings = test_settings();
        settings.execution_authority = "trusted-local".to_string();

        service
            .save_companion_settings(&settings)
            .expect("save settings");

        let audit_entries = service
            .read_recent_audit_history(5)
            .expect("read audit history");

        assert!(audit_entries.iter().any(|entry| {
            entry.category == "permissions"
                && entry.action == "execution_authority.changed"
                && entry.metadata["previousMode"] == "ask-first"
                && entry.metadata["newMode"] == "trusted-local"
        }));
    }

    #[test]
    fn rolls_back_settings_save_when_audit_history_insert_fails() {
        let service = LocalDataService::in_memory().expect("create in-memory service");
        let original_settings = test_settings();

        service
            .save_companion_settings(&original_settings)
            .expect("save original settings");
        service
            .fail_audit_history_writes()
            .expect("force audit history failure");

        let mut updated_settings = original_settings.clone();
        updated_settings.memory_mode = "paused".to_string();
        updated_settings.execution_authority = "trusted-local".to_string();

        let error = service
            .save_companion_settings(&updated_settings)
            .expect_err("settings save fails when audit insert fails");

        assert!(error.contains("forced audit history failure"));
        assert_eq!(
            service
                .read_companion_settings()
                .expect("read settings after failed save"),
            Some(original_settings)
        );
    }

    #[test]
    fn reads_default_execution_authority_policy_without_saved_settings() {
        let service = LocalDataService::in_memory().expect("create in-memory service");
        let policy = service
            .read_execution_authority_policy()
            .expect("read default policy");

        assert_eq!(policy.mode, ExecutionAuthorityMode::AskFirst);
        assert_eq!(
            policy.decision_for(ActionImpact::LowRiskLocal),
            PolicyDecision::Proceed
        );
        assert_eq!(
            policy.decision_for(ActionImpact::LocalFileChange),
            PolicyDecision::Ask
        );
        assert_eq!(
            policy.decision_for(ActionImpact::ExternalMessage),
            PolicyDecision::Ask
        );
        assert_eq!(
            policy.decision_for(ActionImpact::BrowserSubmission),
            PolicyDecision::Ask
        );
        assert_eq!(
            policy.decision_for(ActionImpact::DestructiveChange),
            PolicyDecision::Ask
        );
        assert_eq!(
            policy.decision_for(ActionImpact::Spending),
            PolicyDecision::Ask
        );
    }

    #[test]
    fn updates_execution_authority_and_reads_policy_from_persisted_settings() {
        let service = LocalDataService::in_memory().expect("create in-memory service");

        service
            .save_execution_authority_mode(ExecutionAuthorityMode::TrustedLocal)
            .expect("save trusted local mode");

        let settings = service
            .read_companion_settings()
            .expect("read settings")
            .expect("settings row");
        assert_eq!(settings.execution_authority, "trusted-local");

        let policy = service
            .read_execution_authority_policy()
            .expect("read trusted local policy");
        assert_eq!(policy.mode, ExecutionAuthorityMode::TrustedLocal);
        assert_eq!(
            policy.decision_for(ActionImpact::LowRiskLocal),
            PolicyDecision::Proceed
        );
        assert_eq!(
            policy.decision_for(ActionImpact::LocalFileChange),
            PolicyDecision::Warn
        );
        assert_eq!(
            policy.decision_for(ActionImpact::AppControl),
            PolicyDecision::Warn
        );
        assert_eq!(
            policy.decision_for(ActionImpact::ExternalMessage),
            PolicyDecision::Ask
        );
        assert_eq!(
            policy.decision_for(ActionImpact::DestructiveChange),
            PolicyDecision::Ask
        );
    }

    #[test]
    fn reads_execution_authority_policy_after_storage_reopen() {
        let database_path = temp_local_data_path();

        {
            let service = LocalDataService::open(&database_path).expect("open local data");
            service
                .save_execution_authority_mode(ExecutionAuthorityMode::TrustedLocal)
                .expect("save trusted local mode");
        }

        {
            let service = LocalDataService::open(&database_path).expect("reopen local data");
            let policy = service
                .read_execution_authority_policy()
                .expect("read persisted policy");
            assert_eq!(policy.mode, ExecutionAuthorityMode::TrustedLocal);
            assert_eq!(
                policy.decision_for(ActionImpact::LocalFileChange),
                PolicyDecision::Warn
            );
            assert_eq!(
                policy.decision_for(ActionImpact::BrowserSubmission),
                PolicyDecision::Ask
            );
        }

        std::fs::remove_file(database_path).expect("remove temp database");
    }

    #[test]
    fn imports_legacy_json_before_reading_execution_authority_policy() {
        let service = LocalDataService::in_memory().expect("create in-memory service");
        let mut settings = test_settings();
        settings.execution_authority = "trusted-local".to_string();
        let legacy_path = temp_legacy_settings_path();
        let legacy_settings_json =
            serde_json::to_string_pretty(&settings).expect("encode legacy settings");

        std::fs::write(&legacy_path, legacy_settings_json).expect("write legacy settings");

        let policy = service
            .read_or_import_legacy_execution_authority_policy(&legacy_path)
            .expect("read trusted local legacy policy");
        assert_eq!(policy.mode, ExecutionAuthorityMode::TrustedLocal);
        assert_eq!(
            policy.decision_for(ActionImpact::LocalFileChange),
            PolicyDecision::Warn
        );
        assert_eq!(
            service
                .read_companion_settings()
                .expect("read imported settings")
                .expect("settings row")
                .execution_authority,
            "trusted-local"
        );

        std::fs::remove_file(legacy_path).expect("remove legacy settings");
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

    #[test]
    fn rejects_provider_metadata_that_contains_secret_looking_values() {
        let service = LocalDataService::in_memory().expect("create in-memory service");
        let provider = ProviderMetadata {
            provider_id: "openai".to_string(),
            provider_kind: "model-provider".to_string(),
            display_name: "OpenAI".to_string(),
            auth_status: "configured".to_string(),
            secret_ref: None,
            metadata: json!({ "value": ["sk-test-provider-secret-value"] }),
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
