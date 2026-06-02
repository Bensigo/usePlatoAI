#![cfg_attr(not(test), allow(dead_code))]

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::{
    local_data::{validate_provider_metadata, LocalDataService, ProviderMetadata},
    secret_store::ProviderSecretStore,
};

const OPENAI_PROVIDER_ID: &str = "openai";
pub const OPENAI_API_KEY_AUTH_MODE: &str = "openai_api_key";
pub const CHATGPT_OAUTH_AUTH_MODE: &str = "chatgpt_oauth";
pub const CODEX_APP_SERVER_TOKEN_SOURCE: &str = "codex_app_server";

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderCredentialInput {
    pub provider_id: String,
    pub provider_kind: String,
    pub display_name: String,
    pub credential: String,
    #[serde(default)]
    pub metadata: Value,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatGptOAuthAccountInput {
    pub account_id: Option<String>,
    pub email: Option<String>,
    pub plan_type: Option<String>,
    pub updated_at: Option<String>,
}

pub struct ProviderCredentialService<'a, S> {
    local_data: &'a LocalDataService,
    secret_store: S,
}

impl<'a, S> ProviderCredentialService<'a, S>
where
    S: ProviderSecretStore,
{
    pub fn new(local_data: &'a LocalDataService, secret_store: S) -> Self {
        Self {
            local_data,
            secret_store,
        }
    }

    pub fn save_provider_credential(
        &self,
        input: ProviderCredentialInput,
    ) -> Result<ProviderMetadata, String> {
        validate_provider_id(&input.provider_id)?;

        if input.credential.is_empty() {
            return Err("provider credential cannot be empty".to_string());
        }
        reject_metadata_credential_value(&input.metadata, &input.credential)?;
        validate_provider_metadata(&input.metadata)?;

        let previous_credential = self
            .secret_store
            .read_provider_credential(&input.provider_id)?;
        let secret_ref = self
            .secret_store
            .save_provider_credential(&input.provider_id, &input.credential)?;
        let provider = ProviderMetadata {
            provider_id: input.provider_id,
            provider_kind: input.provider_kind,
            display_name: input.display_name,
            auth_status: "configured".to_string(),
            secret_ref: Some(secret_ref),
            metadata: metadata_with_openai_api_key_auth(input.metadata),
        };

        if let Err(error) = self.local_data.upsert_provider_metadata(&provider) {
            if let Some(previous_credential) = previous_credential {
                let _ = self
                    .secret_store
                    .save_provider_credential(&provider.provider_id, &previous_credential);
            } else {
                let _ = self
                    .secret_store
                    .remove_provider_credential(&provider.provider_id);
            }
            return Err(error);
        }

        Ok(provider)
    }

    pub fn set_chatgpt_oauth_account(
        &self,
        input: ChatGptOAuthAccountInput,
    ) -> Result<ProviderMetadata, String> {
        let existing_provider = self.local_data.read_provider_metadata(OPENAI_PROVIDER_ID)?;
        let account_id = input
            .account_id
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .or_else(|| {
                input
                    .email
                    .as_deref()
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
            })
            .unwrap_or("codex-chatgpt");
        let updated_at = input
            .updated_at
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or("unknown");
        let mut metadata = existing_provider
            .as_ref()
            .map(|provider| provider.metadata.clone())
            .unwrap_or_else(empty_metadata);

        metadata = metadata_with_chatgpt_oauth_account(
            metadata,
            account_id,
            trimmed_optional_string(input.email.as_deref()),
            trimmed_optional_string(input.plan_type.as_deref()),
            updated_at,
        );
        validate_provider_metadata(&metadata)?;

        let provider = ProviderMetadata {
            provider_id: OPENAI_PROVIDER_ID.to_string(),
            provider_kind: existing_provider
                .as_ref()
                .map(|provider| provider.provider_kind.clone())
                .unwrap_or_else(|| "model-provider".to_string()),
            display_name: existing_provider
                .as_ref()
                .map(|provider| provider.display_name.clone())
                .unwrap_or_else(|| "OpenAI".to_string()),
            auth_status: "configured".to_string(),
            secret_ref: existing_provider.and_then(|provider| provider.secret_ref),
            metadata,
        };

        self.local_data.upsert_provider_metadata(&provider)?;
        Ok(provider)
    }

    pub fn clear_chatgpt_oauth_account(&self) -> Result<ProviderMetadata, String> {
        let Some(existing_provider) = self.local_data.read_provider_metadata(OPENAI_PROVIDER_ID)?
        else {
            let provider = ProviderMetadata {
                provider_id: OPENAI_PROVIDER_ID.to_string(),
                provider_kind: "model-provider".to_string(),
                display_name: "OpenAI".to_string(),
                auth_status: "needs-secret".to_string(),
                secret_ref: None,
                metadata: metadata_with_chatgpt_oauth_availability(
                    empty_metadata(),
                    "not-logged-in",
                    None,
                ),
            };
            self.local_data.upsert_provider_metadata(&provider)?;
            return Ok(provider);
        };

        let has_api_key = self
            .secret_store
            .has_provider_credential(OPENAI_PROVIDER_ID)?;
        let metadata = metadata_with_chatgpt_oauth_availability(
            metadata_without_chatgpt_oauth(existing_provider.metadata),
            "not-logged-in",
            None,
        );
        validate_provider_metadata(&metadata)?;
        let provider = ProviderMetadata {
            provider_id: existing_provider.provider_id,
            provider_kind: existing_provider.provider_kind,
            display_name: existing_provider.display_name,
            auth_status: if has_api_key {
                "configured".to_string()
            } else {
                "needs-secret".to_string()
            },
            secret_ref: existing_provider.secret_ref,
            metadata,
        };

        self.local_data.upsert_provider_metadata(&provider)?;
        Ok(provider)
    }

    pub fn record_chatgpt_oauth_availability(
        &self,
        availability: &str,
        error: Option<&str>,
    ) -> Result<ProviderMetadata, String> {
        let existing_provider = self.local_data.read_provider_metadata(OPENAI_PROVIDER_ID)?;
        let has_api_key = self
            .secret_store
            .has_provider_credential(OPENAI_PROVIDER_ID)?;
        let metadata = metadata_with_chatgpt_oauth_availability(
            existing_provider
                .as_ref()
                .map(|provider| provider.metadata.clone())
                .unwrap_or_else(empty_metadata),
            availability,
            error,
        );
        validate_provider_metadata(&metadata)?;
        let provider = ProviderMetadata {
            provider_id: OPENAI_PROVIDER_ID.to_string(),
            provider_kind: existing_provider
                .as_ref()
                .map(|provider| provider.provider_kind.clone())
                .unwrap_or_else(|| "model-provider".to_string()),
            display_name: existing_provider
                .as_ref()
                .map(|provider| provider.display_name.clone())
                .unwrap_or_else(|| "OpenAI".to_string()),
            auth_status: if availability == "logged-in" || has_api_key {
                "configured".to_string()
            } else {
                "needs-secret".to_string()
            },
            secret_ref: existing_provider.and_then(|provider| provider.secret_ref),
            metadata,
        };

        self.local_data.upsert_provider_metadata(&provider)?;
        Ok(provider)
    }

    pub fn has_provider_credential(&self, provider_id: &str) -> Result<bool, String> {
        validate_provider_id(provider_id)?;
        self.secret_store.has_provider_credential(provider_id)
    }

    pub fn remove_provider_credential(
        &self,
        provider_id: &str,
    ) -> Result<Option<ProviderMetadata>, String> {
        validate_provider_id(provider_id)?;
        self.secret_store.remove_provider_credential(provider_id)?;

        let Some(mut provider) = self.local_data.read_provider_metadata(provider_id)? else {
            return Ok(None);
        };

        provider.auth_status = "needs-secret".to_string();
        provider.secret_ref = None;
        if validate_provider_metadata(&provider.metadata).is_err() {
            provider.metadata = Value::Object(Default::default());
        }
        self.local_data.upsert_provider_metadata(&provider)?;

        Ok(Some(provider))
    }
}

fn empty_metadata() -> Value {
    Value::Object(Default::default())
}

fn trimmed_optional_string(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
}

fn metadata_with_openai_api_key_auth(metadata: Value) -> Value {
    let mut metadata = metadata_object(metadata);
    let mut codex_auth = metadata
        .remove("codexAuth")
        .and_then(|value| value.as_object().cloned())
        .unwrap_or_default();

    codex_auth.insert(
        "provider".to_string(),
        Value::String(OPENAI_API_KEY_AUTH_MODE.to_string()),
    );
    codex_auth.insert(
        "openAIApiKey".to_string(),
        serde_json::json!({ "configured": true }),
    );
    metadata.insert("codexAuth".to_string(), Value::Object(codex_auth));

    Value::Object(metadata)
}

fn metadata_with_chatgpt_oauth_account(
    metadata: Value,
    account_id: &str,
    email: Option<String>,
    plan_type: Option<String>,
    updated_at: &str,
) -> Value {
    let mut metadata = metadata_object(metadata);
    let mut codex_auth = metadata
        .remove("codexAuth")
        .and_then(|value| value.as_object().cloned())
        .unwrap_or_default();
    let mut chatgpt_oauth = serde_json::Map::new();

    chatgpt_oauth.insert("accountId".to_string(), Value::String(account_id.to_string()));
    if let Some(email) = email {
        chatgpt_oauth.insert("email".to_string(), Value::String(email));
    }
    if let Some(plan_type) = plan_type {
        chatgpt_oauth.insert("planType".to_string(), Value::String(plan_type));
    }
    chatgpt_oauth.insert(
        "tokenSource".to_string(),
        Value::String(CODEX_APP_SERVER_TOKEN_SOURCE.to_string()),
    );
    chatgpt_oauth.insert("updatedAt".to_string(), Value::String(updated_at.to_string()));
    chatgpt_oauth.insert("configured".to_string(), Value::Bool(true));
    chatgpt_oauth.insert(
        "availability".to_string(),
        Value::String("logged-in".to_string()),
    );

    codex_auth.insert(
        "provider".to_string(),
        Value::String(CHATGPT_OAUTH_AUTH_MODE.to_string()),
    );
    codex_auth.insert(
        "chatGptOAuth".to_string(),
        Value::Object(chatgpt_oauth),
    );
    metadata.insert("codexAuth".to_string(), Value::Object(codex_auth));

    Value::Object(metadata)
}

fn metadata_without_chatgpt_oauth(metadata: Value) -> Value {
    let mut metadata = metadata_object(metadata);
    let mut codex_auth = metadata
        .remove("codexAuth")
        .and_then(|value| value.as_object().cloned())
        .unwrap_or_default();
    codex_auth.remove("chatGptOAuth");
    codex_auth.insert(
        "provider".to_string(),
        if codex_auth.get("openAIApiKey").is_some() {
            Value::String(OPENAI_API_KEY_AUTH_MODE.to_string())
        } else {
            Value::Null
        },
    );
    metadata.insert("codexAuth".to_string(), Value::Object(codex_auth));

    Value::Object(metadata)
}

fn metadata_with_chatgpt_oauth_availability(
    metadata: Value,
    availability: &str,
    error: Option<&str>,
) -> Value {
    let mut metadata = metadata_object(metadata);
    let mut codex_auth = metadata
        .remove("codexAuth")
        .and_then(|value| value.as_object().cloned())
        .unwrap_or_default();
    let mut chatgpt_oauth = codex_auth
        .remove("chatGptOAuth")
        .and_then(|value| value.as_object().cloned())
        .unwrap_or_default();

    chatgpt_oauth.insert(
        "availability".to_string(),
        Value::String(availability.to_string()),
    );
    chatgpt_oauth.insert(
        "configured".to_string(),
        Value::Bool(availability == "logged-in"),
    );
    match error.map(str::trim).filter(|value| !value.is_empty()) {
        Some(error) => {
            chatgpt_oauth.insert("lastError".to_string(), Value::String(error.to_string()));
        }
        None => {
            chatgpt_oauth.remove("lastError");
        }
    }
    codex_auth.insert(
        "chatGptOAuth".to_string(),
        Value::Object(chatgpt_oauth),
    );
    metadata.insert("codexAuth".to_string(), Value::Object(codex_auth));

    Value::Object(metadata)
}

fn metadata_object(value: Value) -> serde_json::Map<String, Value> {
    value.as_object().cloned().unwrap_or_default()
}

fn validate_provider_id(provider_id: &str) -> Result<(), String> {
    if provider_id.trim().is_empty() {
        return Err("provider id cannot be empty".to_string());
    }

    Ok(())
}

fn reject_metadata_credential_value(value: &Value, credential: &str) -> Result<(), String> {
    match value {
        Value::String(metadata_value) => {
            if metadata_value.contains(credential) {
                return Err(
                    "provider metadata must not include the submitted credential value".to_string(),
                );
            }

            Ok(())
        }
        Value::Array(values) => {
            for value in values {
                reject_metadata_credential_value(value, credential)?;
            }

            Ok(())
        }
        Value::Object(entries) => {
            for value in entries.values() {
                reject_metadata_credential_value(value, credential)?;
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
    use crate::secret_store::{provider_secret_ref, test_support::MemoryProviderSecretStore};

    #[test]
    fn saves_detects_and_removes_provider_credentials_without_plain_metadata_secret() {
        let local_data = LocalDataService::in_memory().expect("create local data service");
        let secret_store = MemoryProviderSecretStore::default();
        let service = ProviderCredentialService::new(&local_data, secret_store.clone());
        let credential = "sk-test-provider-secret";

        let metadata = service
            .save_provider_credential(ProviderCredentialInput {
                provider_id: "openai".to_string(),
                provider_kind: "model-provider".to_string(),
                display_name: "OpenAI".to_string(),
                credential: credential.to_string(),
                metadata: json!({ "configuredBy": "test", "engine": "codex" }),
            })
            .expect("save provider credential");

        assert_eq!(metadata.auth_status, "configured");
        assert_eq!(metadata.secret_ref, Some(provider_secret_ref("openai")));
        assert_eq!(
            secret_store.read_credential("openai"),
            Some(credential.to_string())
        );
        assert!(service
            .has_provider_credential("openai")
            .expect("check credential presence"));
        assert!(!local_data
            .contains_plaintext(credential)
            .expect("search local data for plaintext credential"));

        let metadata_after_removal = service
            .remove_provider_credential("openai")
            .expect("remove provider credential")
            .expect("provider metadata");

        assert_eq!(metadata_after_removal.auth_status, "needs-secret");
        assert_eq!(metadata_after_removal.secret_ref, None);
        assert_eq!(secret_store.read_credential("openai"), None);
        assert!(!service
            .has_provider_credential("openai")
            .expect("check removed credential presence"));
        assert!(!local_data
            .contains_plaintext(credential)
            .expect("search local data after removal"));
    }

    #[test]
    fn rejects_provider_credential_metadata_with_secret_material() {
        let local_data = LocalDataService::in_memory().expect("create local data service");
        let secret_store = MemoryProviderSecretStore::default();
        let service = ProviderCredentialService::new(&local_data, secret_store.clone());

        assert!(service
            .save_provider_credential(ProviderCredentialInput {
                provider_id: "openai".to_string(),
                provider_kind: "model-provider".to_string(),
                display_name: "OpenAI".to_string(),
                credential: "sk-test-provider-secret".to_string(),
                metadata: json!({ "access_token": "should-not-live-here" }),
            })
            .is_err());
        assert!(local_data
            .read_provider_metadata("openai")
            .expect("read provider metadata")
            .is_none());
        assert_eq!(secret_store.read_credential("openai"), None);
    }

    #[test]
    fn preserves_existing_provider_credential_when_metadata_update_fails() {
        let local_data = LocalDataService::in_memory().expect("create local data service");
        let secret_store = MemoryProviderSecretStore::default();
        let service = ProviderCredentialService::new(&local_data, secret_store.clone());

        service
            .save_provider_credential(ProviderCredentialInput {
                provider_id: "openai".to_string(),
                provider_kind: "model-provider".to_string(),
                display_name: "OpenAI".to_string(),
                credential: "sk-existing-provider-secret".to_string(),
                metadata: json!({ "configuredBy": "test" }),
            })
            .expect("save existing provider credential");
        local_data
            .fail_provider_metadata_writes()
            .expect("force metadata persistence failure");

        assert!(service
            .save_provider_credential(ProviderCredentialInput {
                provider_id: "openai".to_string(),
                provider_kind: "model-provider".to_string(),
                display_name: "OpenAI updated".to_string(),
                credential: "sk-new-provider-secret".to_string(),
                metadata: json!({ "configuredBy": "test", "engine": "codex" }),
            })
            .is_err());

        assert_eq!(
            secret_store.read_credential("openai"),
            Some("sk-existing-provider-secret".to_string())
        );
        assert!(service
            .has_provider_credential("openai")
            .expect("check credential presence"));
        assert_eq!(
            local_data
                .read_provider_metadata("openai")
                .expect("read provider metadata")
                .expect("provider metadata")
                .display_name,
            "OpenAI"
        );
    }

    #[test]
    fn rejects_provider_credential_metadata_with_submitted_credential_value() {
        let local_data = LocalDataService::in_memory().expect("create local data service");
        let secret_store = MemoryProviderSecretStore::default();
        let service = ProviderCredentialService::new(&local_data, secret_store.clone());
        let credential = "sk-test-provider-secret";

        assert!(service
            .save_provider_credential(ProviderCredentialInput {
                provider_id: "openai".to_string(),
                provider_kind: "model-provider".to_string(),
                display_name: "OpenAI".to_string(),
                credential: credential.to_string(),
                metadata: json!({ "value": { "nested": ["prefix-sk-test-provider-secret"] } }),
            })
            .is_err());
        assert!(local_data
            .read_provider_metadata("openai")
            .expect("read provider metadata")
            .is_none());
        assert_eq!(secret_store.read_credential("openai"), None);
    }

    #[test]
    fn removes_provider_credential_and_repairs_legacy_secret_metadata() {
        let local_data = LocalDataService::in_memory().expect("create local data service");
        let secret_store = MemoryProviderSecretStore::default();
        secret_store
            .save_provider_credential("openai", "sk-test-provider-secret")
            .expect("seed provider credential");
        local_data
            .insert_legacy_provider_metadata_for_test(&ProviderMetadata {
                provider_id: "openai".to_string(),
                provider_kind: "model-provider".to_string(),
                display_name: "OpenAI".to_string(),
                auth_status: "configured".to_string(),
                secret_ref: Some(provider_secret_ref("openai")),
                metadata: json!({ "value": "sk-test-provider-secret" }),
            })
            .expect("seed legacy provider metadata");

        let service = ProviderCredentialService::new(&local_data, secret_store.clone());
        let metadata_after_removal = service
            .remove_provider_credential("openai")
            .expect("remove provider credential")
            .expect("provider metadata");

        assert_eq!(metadata_after_removal.auth_status, "needs-secret");
        assert_eq!(metadata_after_removal.secret_ref, None);
        assert_eq!(metadata_after_removal.metadata, json!({}));
        assert_eq!(secret_store.read_credential("openai"), None);
        assert!(!local_data
            .contains_plaintext("sk-test-provider-secret")
            .expect("search local data after removal"));
    }

    #[test]
    fn records_chatgpt_oauth_account_without_replacing_openai_api_key_secret() {
        let local_data = LocalDataService::in_memory().expect("create local data service");
        let secret_store = MemoryProviderSecretStore::default();
        let service = ProviderCredentialService::new(&local_data, secret_store.clone());

        service
            .save_provider_credential(ProviderCredentialInput {
                provider_id: "openai".to_string(),
                provider_kind: "model-provider".to_string(),
                display_name: "OpenAI".to_string(),
                credential: "sk-test-provider-secret".to_string(),
                metadata: json!({ "engine": "codex" }),
            })
            .expect("save provider credential");
        let metadata = service
            .set_chatgpt_oauth_account(ChatGptOAuthAccountInput {
                account_id: None,
                email: Some("user@example.com".to_string()),
                plan_type: Some("plus".to_string()),
                updated_at: Some("2026-06-02T00:00:00Z".to_string()),
            })
            .expect("save ChatGPT OAuth metadata");

        assert_eq!(metadata.secret_ref, Some(provider_secret_ref("openai")));
        assert_eq!(
            secret_store.read_credential("openai"),
            Some("sk-test-provider-secret".to_string())
        );
        assert_eq!(
            metadata.metadata,
            json!({
                "engine": "codex",
                "codexAuth": {
                    "provider": "chatgpt_oauth",
                    "openAIApiKey": { "configured": true },
                    "chatGptOAuth": {
                        "accountId": "user@example.com",
                        "email": "user@example.com",
                        "planType": "plus",
                        "tokenSource": "codex_app_server",
                        "updatedAt": "2026-06-02T00:00:00Z",
                        "configured": true,
                        "availability": "logged-in"
                    }
                }
            })
        );
        assert!(!local_data
            .contains_plaintext("access_token")
            .expect("search for token key"));
        assert!(!local_data
            .contains_plaintext("refresh_token")
            .expect("search for refresh token key"));
    }

    #[test]
    fn clears_chatgpt_oauth_without_removing_openai_api_key_secret() {
        let local_data = LocalDataService::in_memory().expect("create local data service");
        let secret_store = MemoryProviderSecretStore::default();
        let service = ProviderCredentialService::new(&local_data, secret_store.clone());

        service
            .save_provider_credential(ProviderCredentialInput {
                provider_id: "openai".to_string(),
                provider_kind: "model-provider".to_string(),
                display_name: "OpenAI".to_string(),
                credential: "sk-test-provider-secret".to_string(),
                metadata: json!({ "engine": "codex" }),
            })
            .expect("save provider credential");
        service
            .set_chatgpt_oauth_account(ChatGptOAuthAccountInput {
                account_id: Some("acct-1".to_string()),
                email: Some("user@example.com".to_string()),
                plan_type: Some("plus".to_string()),
                updated_at: Some("2026-06-02T00:00:00Z".to_string()),
            })
            .expect("save ChatGPT OAuth metadata");

        let metadata = service
            .clear_chatgpt_oauth_account()
            .expect("clear ChatGPT OAuth metadata");

        assert_eq!(metadata.auth_status, "configured");
        assert_eq!(metadata.secret_ref, Some(provider_secret_ref("openai")));
        assert_eq!(
            secret_store.read_credential("openai"),
            Some("sk-test-provider-secret".to_string())
        );
        assert_eq!(
            metadata.metadata["codexAuth"]["provider"],
            json!("openai_api_key")
        );
        assert_eq!(
            metadata.metadata["codexAuth"]["chatGptOAuth"]["availability"],
            json!("not-logged-in")
        );
        assert_eq!(
            metadata.metadata["codexAuth"]["chatGptOAuth"]["configured"],
            json!(false)
        );
        assert!(metadata.metadata["codexAuth"]["chatGptOAuth"].get("accountId").is_none());
    }
}
