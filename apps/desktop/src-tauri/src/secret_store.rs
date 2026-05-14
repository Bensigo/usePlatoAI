#![cfg_attr(not(test), allow(dead_code))]

use keyring_core::{Entry, Error};

const PROVIDER_CREDENTIAL_SERVICE: &str = "usePlatoAI provider credentials";
const PROVIDER_SECRET_REF_PREFIX: &str = "os-secret://useplatoai/provider/";

pub fn provider_secret_ref(provider_id: &str) -> String {
    format!("{PROVIDER_SECRET_REF_PREFIX}{provider_id}")
}

pub trait ProviderSecretStore {
    fn save_provider_credential(
        &self,
        provider_id: &str,
        credential: &str,
    ) -> Result<String, String>;
    fn has_provider_credential(&self, provider_id: &str) -> Result<bool, String>;
    fn remove_provider_credential(&self, provider_id: &str) -> Result<(), String>;
}

#[derive(Debug, Clone, Copy, Default)]
pub struct KeychainProviderSecretStore;

impl KeychainProviderSecretStore {
    pub fn new() -> Result<Self, String> {
        use_apple_keychain_store()?;
        Ok(Self)
    }

    fn entry(provider_id: &str) -> Result<Entry, String> {
        Entry::new(PROVIDER_CREDENTIAL_SERVICE, provider_id).map_err(secret_store_error)
    }
}

impl ProviderSecretStore for KeychainProviderSecretStore {
    fn save_provider_credential(
        &self,
        provider_id: &str,
        credential: &str,
    ) -> Result<String, String> {
        Self::entry(provider_id)?
            .set_password(credential)
            .map_err(secret_store_error)?;

        Ok(provider_secret_ref(provider_id))
    }

    fn has_provider_credential(&self, provider_id: &str) -> Result<bool, String> {
        match Self::entry(provider_id)?.get_password() {
            Ok(_) => Ok(true),
            Err(Error::NoEntry) => Ok(false),
            Err(error) => Err(secret_store_error(error)),
        }
    }

    fn remove_provider_credential(&self, provider_id: &str) -> Result<(), String> {
        match Self::entry(provider_id)?.delete_credential() {
            Ok(()) | Err(Error::NoEntry) => Ok(()),
            Err(error) => Err(secret_store_error(error)),
        }
    }
}

fn secret_store_error(error: Error) -> String {
    format!("provider secret store error: {error}")
}

#[cfg(target_os = "macos")]
fn use_apple_keychain_store() -> Result<(), String> {
    use std::collections::HashMap;

    use apple_native_keyring_store::keychain::Store;
    use keyring_core::set_default_store;

    let store = Store::new_with_configuration(&HashMap::new()).map_err(secret_store_error)?;
    set_default_store(store);
    Ok(())
}

#[cfg(not(target_os = "macos"))]
fn use_apple_keychain_store() -> Result<(), String> {
    Err("macOS Keychain provider secret store is only available on macOS".to_string())
}

#[cfg(test)]
pub mod test_support {
    use std::{
        collections::HashMap,
        sync::{Arc, Mutex},
    };

    use super::{provider_secret_ref, ProviderSecretStore};

    #[derive(Debug, Clone, Default)]
    pub struct MemoryProviderSecretStore {
        credentials: Arc<Mutex<HashMap<String, String>>>,
    }

    impl MemoryProviderSecretStore {
        pub fn read_credential(&self, provider_id: &str) -> Option<String> {
            self.credentials
                .lock()
                .expect("memory secret store lock")
                .get(provider_id)
                .cloned()
        }
    }

    impl ProviderSecretStore for MemoryProviderSecretStore {
        fn save_provider_credential(
            &self,
            provider_id: &str,
            credential: &str,
        ) -> Result<String, String> {
            self.credentials
                .lock()
                .expect("memory secret store lock")
                .insert(provider_id.to_string(), credential.to_string());

            Ok(provider_secret_ref(provider_id))
        }

        fn has_provider_credential(&self, provider_id: &str) -> Result<bool, String> {
            Ok(self
                .credentials
                .lock()
                .expect("memory secret store lock")
                .contains_key(provider_id))
        }

        fn remove_provider_credential(&self, provider_id: &str) -> Result<(), String> {
            self.credentials
                .lock()
                .expect("memory secret store lock")
                .remove(provider_id);

            Ok(())
        }
    }
}
