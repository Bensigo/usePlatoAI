use std::{
    io::{BufRead, BufReader, Write},
    process::{Child, ChildStdin, Command, Stdio},
    sync::mpsc::{self, Receiver},
    thread,
    time::Duration,
};

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum ChatGptLoginMode {
    Browser,
    DeviceCode,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
#[serde(tag = "type")]
pub enum ChatGptLoginStarted {
    #[serde(rename = "browser")]
    Browser { login_id: String, auth_url: String },
    #[serde(rename = "device_code")]
    DeviceCode {
        login_id: String,
        verification_url: String,
        user_code: String,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexAccountSnapshot {
    pub auth_mode: Option<String>,
    pub email: Option<String>,
    pub plan_type: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatGptOAuthLoginResult {
    pub started: ChatGptLoginStarted,
    pub account: CodexAccountSnapshot,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CodexAppServerAuthError {
    MissingRuntime(String),
    LoginFailed(String),
}

impl CodexAppServerAuthError {
    pub fn availability(&self) -> &'static str {
        match self {
            Self::MissingRuntime(_) => "missing-runtime",
            Self::LoginFailed(_) => "login-failed",
        }
    }
}

impl std::fmt::Display for CodexAppServerAuthError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::MissingRuntime(message) | Self::LoginFailed(message) => {
                formatter.write_str(message)
            }
        }
    }
}

pub trait CodexAppServerAuthClient {
    fn start_chatgpt_oauth_login(
        &mut self,
        mode: ChatGptLoginMode,
    ) -> Result<ChatGptOAuthLoginResult, CodexAppServerAuthError>;

    fn close(&mut self) {}
}

pub trait CodexAccountRpcTransport {
    fn request(&mut self, method: &str, params: Option<Value>) -> Result<Value, String>;
    fn notify(&mut self, method: &str, params: Option<Value>) -> Result<(), String>;
    fn wait_for_notification(
        &mut self,
        method: &str,
        predicate: &mut dyn FnMut(&Value) -> bool,
        timeout: Duration,
    ) -> Result<Value, String>;
    fn close(&mut self) {}
}

pub struct CodexAppServerAuthSession<T> {
    transport: T,
    initialized: bool,
}

impl<T> CodexAppServerAuthSession<T>
where
    T: CodexAccountRpcTransport,
{
    pub fn new(transport: T) -> Self {
        Self {
            transport,
            initialized: false,
        }
    }

    fn initialize(&mut self) -> Result<(), CodexAppServerAuthError> {
        if self.initialized {
            return Ok(());
        }

        self.transport
            .request(
                "initialize",
                Some(json!({
                    "clientInfo": {
                        "name": "useplatoai",
                        "title": "usePlatoAI",
                        "version": env!("CARGO_PKG_VERSION")
                    }
                })),
            )
            .map_err(CodexAppServerAuthError::LoginFailed)?;
        self.transport
            .notify("initialized", None)
            .map_err(CodexAppServerAuthError::LoginFailed)?;
        self.initialized = true;
        Ok(())
    }
}

impl<T> CodexAppServerAuthClient for CodexAppServerAuthSession<T>
where
    T: CodexAccountRpcTransport,
{
    fn start_chatgpt_oauth_login(
        &mut self,
        mode: ChatGptLoginMode,
    ) -> Result<ChatGptOAuthLoginResult, CodexAppServerAuthError> {
        self.initialize()?;
        let started = normalize_login_started(
            self.transport
                .request(
                    "account/login/start",
                    Some(json!({
                        "type": match mode {
                            ChatGptLoginMode::Browser => "chatgpt",
                            ChatGptLoginMode::DeviceCode => "chatgptDeviceCode",
                        }
                    })),
                )
                .map_err(CodexAppServerAuthError::LoginFailed)?,
        )?;
        if let ChatGptLoginStarted::Browser { auth_url, .. } = &started {
            open_browser_url(auth_url);
        }

        let login_id = login_id_for_started(&started).to_string();
        let completed = self
            .transport
            .wait_for_notification(
                "account/login/completed",
                &mut |params| {
                    params
                        .get("loginId")
                        .and_then(Value::as_str)
                        .map(|candidate| candidate == login_id)
                        .unwrap_or(false)
                },
                Duration::from_secs(300),
            )
            .map_err(CodexAppServerAuthError::LoginFailed)?;
        if !completed
            .get("success")
            .and_then(Value::as_bool)
            .unwrap_or(false)
        {
            return Err(CodexAppServerAuthError::LoginFailed(
                completed
                    .get("error")
                    .and_then(Value::as_str)
                    .unwrap_or("ChatGPT OAuth login failed")
                    .to_string(),
            ));
        }

        let account = normalize_account_snapshot(
            self.transport
                .request("account/read", Some(json!({ "refreshToken": true })))
                .map_err(CodexAppServerAuthError::LoginFailed)?,
        )?;
        if account.auth_mode.as_deref() != Some("chatgpt") {
            return Err(CodexAppServerAuthError::LoginFailed(
                "Codex app-server did not report ChatGPT auth after login".to_string(),
            ));
        }

        Ok(ChatGptOAuthLoginResult { started, account })
    }

    fn close(&mut self) {
        self.transport.close();
    }
}

pub type ProcessCodexAppServerAuthClient = CodexAppServerAuthSession<JsonlRpcProcessTransport>;

pub fn open_process_codex_app_server_auth_client()
    -> Result<ProcessCodexAppServerAuthClient, CodexAppServerAuthError>
{
    JsonlRpcProcessTransport::spawn("codex", &["app-server", "--listen", "stdio://"])
        .map(CodexAppServerAuthSession::new)
}

pub struct JsonlRpcProcessTransport {
    child: Child,
    stdin: ChildStdin,
    lines: Receiver<String>,
    next_id: u64,
}

impl JsonlRpcProcessTransport {
    fn spawn(command: &str, args: &[&str]) -> Result<Self, CodexAppServerAuthError> {
        let mut child = Command::new(command)
            .args(args)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|error| {
                if error.kind() == std::io::ErrorKind::NotFound {
                    CodexAppServerAuthError::MissingRuntime(
                        "Codex CLI/app-server is not installed or is not on PATH".to_string(),
                    )
                } else {
                    CodexAppServerAuthError::LoginFailed(format!(
                        "Unable to start Codex app-server: {error}"
                    ))
                }
            })?;
        let stdin = child
            .stdin
            .take()
            .ok_or_else(|| CodexAppServerAuthError::LoginFailed("Codex stdin unavailable".into()))?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| CodexAppServerAuthError::LoginFailed("Codex stdout unavailable".into()))?;
        let (sender, lines) = mpsc::channel();
        thread::spawn(move || {
            let reader = BufReader::new(stdout);
            for line in reader.lines().map_while(Result::ok) {
                let _ = sender.send(line);
            }
        });

        Ok(Self {
            child,
            stdin,
            lines,
            next_id: 1,
        })
    }

    fn write_message(&mut self, message: &Value) -> Result<(), String> {
        serde_json::to_writer(&mut self.stdin, message).map_err(|error| error.to_string())?;
        self.stdin
            .write_all(b"\n")
            .and_then(|_| self.stdin.flush())
            .map_err(|error| error.to_string())
    }

    fn read_message(&mut self, timeout: Duration) -> Result<Value, String> {
        let line = self
            .lines
            .recv_timeout(timeout)
            .map_err(|_| "Timed out waiting for Codex app-server".to_string())?;
        serde_json::from_str(&line)
            .map_err(|error| format!("Codex app-server returned invalid JSON: {error}"))
    }
}

impl CodexAccountRpcTransport for JsonlRpcProcessTransport {
    fn request(&mut self, method: &str, params: Option<Value>) -> Result<Value, String> {
        let id = self.next_id;
        self.next_id += 1;
        let mut message = json!({ "id": id, "method": method });
        if let Some(params) = params {
            message["params"] = params;
        }
        self.write_message(&message)?;

        loop {
            let response = self.read_message(Duration::from_secs(30))?;
            if response.get("id").and_then(Value::as_u64) != Some(id) {
                continue;
            }
            if let Some(error) = response.get("error") {
                return Err(format_rpc_error(error));
            }
            return Ok(response.get("result").cloned().unwrap_or(Value::Null));
        }
    }

    fn notify(&mut self, method: &str, params: Option<Value>) -> Result<(), String> {
        let mut message = json!({ "method": method });
        if let Some(params) = params {
            message["params"] = params;
        }
        self.write_message(&message)
    }

    fn wait_for_notification(
        &mut self,
        method: &str,
        predicate: &mut dyn FnMut(&Value) -> bool,
        timeout: Duration,
    ) -> Result<Value, String> {
        loop {
            let response = self.read_message(timeout)?;
            if response.get("method").and_then(Value::as_str) != Some(method) {
                continue;
            }
            let params = response.get("params").cloned().unwrap_or(Value::Null);
            if predicate(&params) {
                return Ok(params);
            }
        }
    }

    fn close(&mut self) {
        let _ = self.child.kill();
    }
}

impl Drop for JsonlRpcProcessTransport {
    fn drop(&mut self) {
        self.close();
    }
}

fn login_id_for_started(started: &ChatGptLoginStarted) -> &str {
    match started {
        ChatGptLoginStarted::Browser { login_id, .. }
        | ChatGptLoginStarted::DeviceCode { login_id, .. } => login_id,
    }
}

fn normalize_login_started(value: Value) -> Result<ChatGptLoginStarted, CodexAppServerAuthError> {
    let response_type = value.get("type").and_then(Value::as_str).unwrap_or_default();
    match response_type {
        "chatgpt" => Ok(ChatGptLoginStarted::Browser {
            login_id: required_string(&value, "loginId")?,
            auth_url: required_string(&value, "authUrl")?,
        }),
        "chatgptDeviceCode" => Ok(ChatGptLoginStarted::DeviceCode {
            login_id: required_string(&value, "loginId")?,
            verification_url: required_string(&value, "verificationUrl")?,
            user_code: required_string(&value, "userCode")?,
        }),
        _ => Err(CodexAppServerAuthError::LoginFailed(
            "Codex app-server returned an unsupported ChatGPT login response".to_string(),
        )),
    }
}

fn normalize_account_snapshot(value: Value) -> Result<CodexAccountSnapshot, CodexAppServerAuthError> {
    let account = value.get("account").unwrap_or(&value);
    let account_type = account
        .get("type")
        .or_else(|| account.get("authMode"))
        .and_then(Value::as_str);
    let auth_mode = match account_type {
        Some("apiKey") => Some("apikey".to_string()),
        Some("apikey" | "chatgpt") => account_type.map(ToString::to_string),
        _ => None,
    };

    Ok(CodexAccountSnapshot {
        auth_mode,
        email: optional_string(account, "email")
            .or_else(|| optional_string(account, "chatGptEmail"))
            .or_else(|| optional_string(&value, "email")),
        plan_type: optional_string(account, "planType")
            .or_else(|| optional_string(account, "chatGptPlanType"))
            .or_else(|| optional_string(&value, "planType")),
    })
}

fn required_string(value: &Value, key: &str) -> Result<String, CodexAppServerAuthError> {
    optional_string(value, key).ok_or_else(|| {
        CodexAppServerAuthError::LoginFailed(format!(
            "Codex app-server response missing `{key}`"
        ))
    })
}

fn optional_string(value: &Value, key: &str) -> Option<String> {
    value
        .get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
}

fn format_rpc_error(error: &Value) -> String {
    error
        .get("message")
        .and_then(Value::as_str)
        .unwrap_or("Codex app-server request failed")
        .to_string()
}

fn open_browser_url(url: &str) {
    #[cfg(all(target_os = "macos", not(test)))]
    {
        let _ = Command::new("open").arg(url).spawn();
    }
    #[cfg(any(not(target_os = "macos"), test))]
    let _ = url;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[derive(Default)]
    struct FakeTransport {
        requests: Vec<(String, Option<Value>)>,
        notifications: Vec<(String, Option<Value>)>,
        login_start: Value,
        login_completed: Value,
        account: Value,
    }

    impl CodexAccountRpcTransport for FakeTransport {
        fn request(&mut self, method: &str, params: Option<Value>) -> Result<Value, String> {
            self.requests.push((method.to_string(), params));
            match method {
                "initialize" => Ok(json!({ "server": "fake-codex" })),
                "account/login/start" => Ok(self.login_start.clone()),
                "account/read" => Ok(self.account.clone()),
                other => Err(format!("unexpected request {other}")),
            }
        }

        fn notify(&mut self, method: &str, params: Option<Value>) -> Result<(), String> {
            self.notifications.push((method.to_string(), params));
            Ok(())
        }

        fn wait_for_notification(
            &mut self,
            method: &str,
            predicate: &mut dyn FnMut(&Value) -> bool,
            _timeout: Duration,
        ) -> Result<Value, String> {
            if method == "account/login/completed" && predicate(&self.login_completed) {
                return Ok(self.login_completed.clone());
            }

            Err("unexpected notification wait".to_string())
        }
    }

    #[test]
    fn starts_browser_chatgpt_oauth_and_reads_account_without_tokens() {
        let transport = FakeTransport {
            login_start: json!({
                "type": "chatgpt",
                "loginId": "login-1",
                "authUrl": "https://chatgpt.com/auth"
            }),
            login_completed: json!({
                "loginId": "login-1",
                "success": true
            }),
            account: json!({
                "account": {
                    "type": "chatgpt",
                    "email": "user@example.com",
                    "planType": "plus"
                },
                "requiresOpenaiAuth": false
            }),
            ..Default::default()
        };
        let mut session = CodexAppServerAuthSession::new(transport);

        let result = session
            .start_chatgpt_oauth_login(ChatGptLoginMode::Browser)
            .expect("start ChatGPT OAuth login");

        assert_eq!(
            result,
            ChatGptOAuthLoginResult {
                started: ChatGptLoginStarted::Browser {
                    login_id: "login-1".to_string(),
                    auth_url: "https://chatgpt.com/auth".to_string()
                },
                account: CodexAccountSnapshot {
                    auth_mode: Some("chatgpt".to_string()),
                    email: Some("user@example.com".to_string()),
                    plan_type: Some("plus".to_string())
                }
            }
        );
        assert_eq!(
            session.transport.requests[1],
            (
                "account/login/start".to_string(),
                Some(json!({ "type": "chatgpt" }))
            )
        );
        assert_eq!(
            session.transport.requests[2],
            (
                "account/read".to_string(),
                Some(json!({ "refreshToken": true }))
            )
        );
        assert_eq!(
            session.transport.notifications,
            vec![("initialized".to_string(), None)]
        );
    }

    #[test]
    fn starts_device_code_chatgpt_oauth() {
        let transport = FakeTransport {
            login_start: json!({
                "type": "chatgptDeviceCode",
                "loginId": "login-2",
                "verificationUrl": "https://auth.openai.com/codex/device",
                "userCode": "ABCD-1234"
            }),
            login_completed: json!({
                "loginId": "login-2",
                "success": true
            }),
            account: json!({
                "account": {
                    "type": "chatgpt",
                    "email": "user@example.com",
                    "planType": "pro"
                }
            }),
            ..Default::default()
        };
        let mut session = CodexAppServerAuthSession::new(transport);

        session
            .start_chatgpt_oauth_login(ChatGptLoginMode::DeviceCode)
            .expect("start device-code login");

        assert_eq!(
            session.transport.requests[1],
            (
                "account/login/start".to_string(),
                Some(json!({ "type": "chatgptDeviceCode" }))
            )
        );
    }

    #[test]
    fn reports_failed_chatgpt_oauth_login() {
        let transport = FakeTransport {
            login_start: json!({
                "type": "chatgpt",
                "loginId": "login-3",
                "authUrl": "https://chatgpt.com/auth"
            }),
            login_completed: json!({
                "loginId": "login-3",
                "success": false,
                "error": "user cancelled"
            }),
            account: json!(null),
            ..Default::default()
        };
        let mut session = CodexAppServerAuthSession::new(transport);

        let error = session
            .start_chatgpt_oauth_login(ChatGptLoginMode::Browser)
            .expect_err("login should fail");

        assert_eq!(error.availability(), "login-failed");
        assert_eq!(error.to_string(), "user cancelled");
    }
}
