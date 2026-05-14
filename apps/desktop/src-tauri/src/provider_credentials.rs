#![cfg_attr(not(test), allow(dead_code))]

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::{
    local_data::{validate_provider_metadata, LocalDataService, ProviderMetadata},
    secret_store::ProviderSecretStore,
};

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
        validate_provider_metadata(&input.metadata)?;

        let secret_ref = self
            .secret_store
            .save_provider_credential(&input.provider_id, &input.credential)?;
        let provider = ProviderMetadata {
            provider_id: input.provider_id,
            provider_kind: input.provider_kind,
            display_name: input.display_name,
            auth_status: "configured".to_string(),
            secret_ref: Some(secret_ref),
            metadata: input.metadata,
        };

        if let Err(error) = self.local_data.upsert_provider_metadata(&provider) {
            let _ = self
                .secret_store
                .remove_provider_credential(&provider.provider_id);
            return Err(error);
        }

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
        self.local_data.upsert_provider_metadata(&provider)?;

        Ok(Some(provider))
    }
}

fn validate_provider_id(provider_id: &str) -> Result<(), String> {
    if provider_id.trim().is_empty() {
        return Err("provider id cannot be empty".to_string());
    }

    Ok(())
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
}
