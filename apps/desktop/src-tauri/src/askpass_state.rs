//! Askpass session state management for secure Git authentication.
//!
//! This module provides the [`GitAuthBrokerState`] which manages authentication sessions
//! that bridge between the askpass helper executable and the Tauri backend.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tokio::sync::Notify;

/// Type alias for the responses storage to simplify complex type signatures.
/// Maps session_id -> Vec of (prompt_id, response) pairs to preserve insertion order.
type ResponsesMap = HashMap<String, Vec<(String, GitAuthPromptResponse)>>;

/// Type alias for the prompts storage to simplify complex type signatures.
/// Maps session_id -> (prompt_id -> prompt_record).
type PromptsMap = HashMap<String, HashMap<String, GitAuthPromptRecord>>;

/// Type alias for the notifiers storage to simplify complex type signatures.
/// Maps (session_id, prompt_id) -> Notify handle.
type NotifiersMap = HashMap<(String, String), Arc<Notify>>;

/// Handle to a Git authentication session containing the session ID, secret, and operation type.
#[derive(Clone, Debug)]
pub(crate) struct GitAuthSessionHandle {
    pub(crate) session_id: String,
    pub(crate) secret: String,
    pub(crate) operation: String,
}

/// Response to a Git authentication prompt from the frontend.
#[derive(Clone, Debug)]
pub(crate) struct GitAuthPromptResponse {
    pub(crate) username: Option<String>,
    pub(crate) secret: Option<String>,
    pub(crate) remember: bool,
    pub(crate) cancelled: bool,
}

/// Prompt context captured when the askpass helper queued a frontend prompt.
#[derive(Clone, Debug)]
pub(crate) struct GitAuthPromptContext {
    pub(crate) prompt: String,
    pub(crate) host: Option<String>,
    pub(crate) username: Option<String>,
}

/// Internal record of a Git authentication prompt stored in the broker state.
#[derive(Clone, Debug)]
struct GitAuthPromptRecord {
    prompt: String,
    host: Option<String>,
    username: Option<String>,
}

/// Internal record of a Git authentication session stored in the broker state.
#[derive(Clone, Debug)]
struct GitAuthSessionRecord {
    secret: String,
    operation: String,
}

/// Shared state for managing Git authentication sessions.
///
/// This state is registered with Tauri and provides secure session management
/// for Git operations that require authentication.
#[derive(Clone, Default)]
pub(crate) struct GitAuthBrokerState {
    sessions: Arc<Mutex<HashMap<String, GitAuthSessionRecord>>>,
    prompts: Arc<Mutex<PromptsMap>>,
    // Using Vec to preserve insertion order for take_last_prompt_response
    responses: Arc<Mutex<ResponsesMap>>,
    // Notifies listeners when a new response is available for a prompt (session_id, prompt_id)
    notifiers: Arc<Mutex<NotifiersMap>>,
}

/// Drop guard that guarantees askpass session cleanup on all exit paths.
pub(crate) struct SessionCleanupGuard<'a> {
    session_id: Option<String>,
    state: &'a GitAuthBrokerState,
}

impl<'a> SessionCleanupGuard<'a> {
    pub(crate) fn new(state: &'a GitAuthBrokerState, session_id: String) -> Self {
        Self {
            session_id: Some(session_id),
            state,
        }
    }

    #[cfg(test)]
    fn disarm(&mut self) {
        self.session_id = None;
    }
}

impl Drop for SessionCleanupGuard<'_> {
    fn drop(&mut self) {
        if let Some(session_id) = self.session_id.take() {
            let _ = self.state.remove_session(&session_id);
        }
    }
}

impl GitAuthBrokerState {
    /// Creates a new authentication session for the specified operation.
    ///
    /// # Arguments
    ///
    /// * `operation` - The Git operation type (e.g., "clone", "push", "fetch")
    ///
    /// # Returns
    ///
    /// Returns a `GitAuthSessionHandle` containing the session ID and secret,
    /// or an error string if the session could not be created.
    pub(crate) fn create_session(&self, operation: &str) -> Result<GitAuthSessionHandle, String> {
        let session_id = crate::random_token();
        let secret = crate::random_token();
        let record = GitAuthSessionRecord {
            secret: secret.clone(),
            operation: operation.to_string(),
        };

        let mut sessions = self
            .sessions
            .lock()
            .map_err(|_| "Failed to access auth broker state".to_string())?;

        sessions.insert(session_id.clone(), record);

        Ok(GitAuthSessionHandle {
            session_id,
            secret,
            operation: operation.to_string(),
        })
    }

    /// Verifies that the provided secret matches the stored secret for the given session ID.
    ///
    /// # Arguments
    ///
    /// * `session_id` - The unique session identifier
    /// * `secret` - The secret to verify
    ///
    /// # Returns
    ///
    /// Returns `true` if the secret is valid for the session, `false` otherwise.
    pub(crate) fn verify_session_secret(&self, session_id: &str, secret: &str) -> bool {
        let Ok(sessions) = self.sessions.lock() else {
            return false;
        };

        sessions
            .get(session_id)
            .map(|record| record.secret == secret)
            .unwrap_or(false)
    }

    /// Retrieves the operation type for a given session ID.
    ///
    /// # Arguments
    ///
    /// * `session_id` - The unique session identifier
    ///
    /// # Returns
    ///
    /// Returns `Some(operation)` if the session exists, `None` otherwise.
    pub(crate) fn get_session_operation(&self, session_id: &str) -> Option<String> {
        let Ok(sessions) = self.sessions.lock() else {
            return None;
        };

        sessions
            .get(session_id)
            .map(|record| record.operation.clone())
    }

    /// Removes a session from the broker state.
    ///
    /// # Arguments
    ///
    /// * `session_id` - The unique session identifier to remove
    ///
    /// # Returns
    ///
    /// Returns `true` if a session was removed, `false` if no session existed.
    pub(crate) fn remove_session(&self, session_id: &str) -> bool {
        let Ok(mut sessions) = self.sessions.lock() else {
            return false;
        };

        let removed = sessions.remove(session_id).is_some();
        drop(sessions);

        if !removed {
            return false;
        }

        if let Ok(mut prompts) = self.prompts.lock() {
            prompts.remove(session_id);
        }

        if let Ok(mut responses) = self.responses.lock() {
            responses.remove(session_id);
        }

        if let Ok(mut notifiers) = self.notifiers.lock() {
            notifiers.retain(|(notifier_session_id, _), _| notifier_session_id != session_id);
        }

        true
    }

    /// Queues a prompt for the specified session.
    ///
    /// # Arguments
    ///
    /// * `session_id` - The unique session identifier
    /// * `prompt` - The prompt text to display to the user
    /// * `host` - Optional host information (e.g., URL)
    /// * `username` - Optional suggested username
    ///
    /// # Returns
    ///
    /// Returns a unique prompt ID string, or an error if the operation fails.
    pub(crate) fn queue_prompt(
        &self,
        session_id: &str,
        prompt: &str,
        host: Option<&str>,
        username: Option<&str>,
    ) -> Result<String, String> {
        let prompt_id = crate::random_token();
        let record = GitAuthPromptRecord {
            prompt: prompt.to_string(),
            host: host.map(String::from),
            username: username.map(String::from),
        };

        let mut prompts = self
            .prompts
            .lock()
            .map_err(|_| "Failed to lock prompts".to_string())?;

        let session_prompts = prompts.entry(session_id.to_string()).or_default();
        session_prompts.insert(prompt_id.clone(), record);

        Ok(prompt_id)
    }

    /// Stores a response to a queued prompt.
    ///
    /// # Arguments
    ///
    /// * `session_id` - The unique session identifier
    /// * `prompt_id` - The unique prompt identifier
    /// * `username` - Optional username from the user
    /// * `secret` - Optional secret/password from the user
    /// * `remember` - Whether the user wants to remember these credentials
    /// * `cancelled` - Whether the user cancelled the prompt
    ///
    /// # Returns
    ///
    /// Returns `Ok(())` on success, or an error string if the operation fails.
    pub(crate) fn store_prompt_response(
        &self,
        session_id: &str,
        prompt_id: &str,
        username: Option<&str>,
        secret: Option<&str>,
        remember: bool,
        cancelled: bool,
    ) -> Result<(), String> {
        let response = GitAuthPromptResponse {
            username: username.map(String::from),
            secret: secret.map(String::from),
            remember,
            cancelled,
        };

        let mut responses = self
            .responses
            .lock()
            .map_err(|_| "Failed to lock responses".to_string())?;

        let session_responses = responses.entry(session_id.to_string()).or_default();
        // Store as (prompt_id, response) tuple to preserve insertion order
        session_responses.push((prompt_id.to_string(), response));

        // Notify any listeners
        if let Ok(mut notifiers) = self.notifiers.lock() {
            if let Some(notifier) =
                notifiers.remove(&(session_id.to_string(), prompt_id.to_string()))
            {
                notifier.notify_one();
            }
        }

        Ok(())
    }

    /// Takes (removes and returns) a stored prompt response.
    ///
    /// # Arguments
    ///
    /// * `session_id` - The unique session identifier
    /// * `prompt_id` - The unique prompt identifier
    ///
    /// # Returns
    ///
    /// Returns `Some(GitAuthPromptResponse)` if found, `None` otherwise.
    pub(crate) fn take_prompt_response(
        &self,
        session_id: &str,
        prompt_id: &str,
    ) -> Option<GitAuthPromptResponse> {
        let mut responses = self.responses.lock().ok()?;
        let session_responses = responses.get_mut(session_id)?;
        // Find and remove the response with matching prompt_id
        let index = session_responses
            .iter()
            .position(|(id, _)| id == prompt_id)?;
        Some(session_responses.remove(index).1)
    }

    /// Returns the stored prompt context for a queued prompt.
    pub(crate) fn get_prompt_context(
        &self,
        session_id: &str,
        prompt_id: &str,
    ) -> Option<GitAuthPromptContext> {
        let prompts = self.prompts.lock().ok()?;
        let session_prompts = prompts.get(session_id)?;
        let prompt = session_prompts.get(prompt_id)?;

        Some(GitAuthPromptContext {
            prompt: prompt.prompt.clone(),
            host: prompt.host.clone(),
            username: prompt.username.clone(),
        })
    }

    /// Returns true when any prompt has been queued for the session.
    pub(crate) fn session_has_prompt(&self, session_id: &str) -> bool {
        let Ok(prompts) = self.prompts.lock() else {
            return false;
        };

        prompts
            .get(session_id)
            .is_some_and(|session_prompts| !session_prompts.is_empty())
    }

    /// Asynchronously waits for a prompt response.
    ///
    /// # Arguments
    ///
    /// * `session_id` - The unique session identifier
    /// * `prompt_id` - The unique prompt identifier
    /// * `timeout` - Maximum duration to wait
    ///
    /// # Returns
    ///
    /// Returns `Some(GitAuthPromptResponse)` if received within timeout, `None` otherwise.
    pub(crate) async fn wait_for_prompt_response(
        &self,
        session_id: &str,
        prompt_id: &str,
        timeout: std::time::Duration,
    ) -> Option<GitAuthPromptResponse> {
        // First check if it's already there
        if let Some(response) = self.take_prompt_response(session_id, prompt_id) {
            return Some(response);
        }

        let notifier_key = (session_id.to_string(), prompt_id.to_string());
        let notifier = Arc::new(Notify::new());
        {
            let Ok(mut notifiers) = self.notifiers.lock() else {
                return None;
            };
            notifiers.insert(notifier_key.clone(), notifier.clone());
        }

        if let Some(response) = self.take_prompt_response(session_id, prompt_id) {
            if let Ok(mut notifiers) = self.notifiers.lock() {
                notifiers.remove(&notifier_key);
            }
            return Some(response);
        }

        // Wait for notification or timeout
        let _ = tokio::time::timeout(timeout, notifier.notified()).await;

        if let Ok(mut notifiers) = self.notifiers.lock() {
            notifiers.remove(&notifier_key);
        }

        // Try to take it one last time
        self.take_prompt_response(session_id, prompt_id)
    }

    /// Takes (removes and returns) the most recent stored prompt response for a session.
    ///
    /// # Arguments
    ///
    /// * `session_id` - The unique session identifier
    ///
    /// # Returns
    ///
    /// Returns `Some(GitAuthPromptResponse)` if any response exists for the session,
    /// `None` otherwise. This is used to retrieve credentials after a Git operation
    /// to decide whether to approve or reject them.
    pub(crate) fn take_last_prompt_response(
        &self,
        session_id: &str,
    ) -> Option<GitAuthPromptResponse> {
        let mut responses = self.responses.lock().ok()?;
        let session_responses = responses.get_mut(session_id)?;
        // Pop the last entry (most recent response) since Vec preserves insertion order
        session_responses.pop().map(|(_, response)| response)
    }
}

#[cfg(test)]
mod tests {
    use super::{GitAuthBrokerState, SessionCleanupGuard};
    use std::sync::Arc;
    use std::time::Duration;
    use tokio::sync::Notify;

    #[test]
    fn askpass_session_creation_returns_distinct_session_ids() {
        let state = GitAuthBrokerState::default();

        let first = state.create_session("clone").expect("first session");
        let second = state.create_session("push").expect("second session");

        assert_ne!(first.session_id, second.session_id);
        assert_ne!(first.secret, second.secret);
    }

    #[test]
    fn askpass_session_rejects_wrong_secret() {
        let state = GitAuthBrokerState::default();
        let session = state.create_session("fetch").expect("session");

        let accepted = state.verify_session_secret(&session.session_id, "wrong-secret");

        assert!(!accepted);
    }

    #[test]
    fn askpass_session_accepts_correct_secret() {
        let state = GitAuthBrokerState::default();
        let session = state.create_session("pull").expect("session");

        let accepted = state.verify_session_secret(&session.session_id, &session.secret);

        assert!(accepted);
    }

    #[test]
    fn queue_prompt_returns_unique_prompt_id() {
        let state = GitAuthBrokerState::default();
        let session = state.create_session("clone").expect("session");

        let first_id = state
            .queue_prompt(
                &session.session_id,
                "First prompt",
                Some("github.com"),
                Some("user"),
            )
            .expect("first prompt should queue");
        let second_id = state
            .queue_prompt(&session.session_id, "Second prompt", None, None)
            .expect("second prompt should queue");

        assert_ne!(first_id, second_id);
        assert_eq!(first_id.len(), 24);
        assert_eq!(second_id.len(), 24);
    }

    #[test]
    fn remove_session_should_return_true_when_session_exists() {
        let state = GitAuthBrokerState::default();
        let session = state.create_session("clone").expect("session");

        let removed = state.remove_session(&session.session_id);

        assert!(removed);
        // Session should no longer exist
        assert!(!state.verify_session_secret(&session.session_id, &session.secret));
    }

    #[test]
    fn remove_session_should_clear_prompt_response_and_notifier_state() {
        let state = GitAuthBrokerState::default();
        let session = state.create_session("clone").expect("session");
        let prompt_id = state
            .queue_prompt(
                &session.session_id,
                "Password:",
                Some("github.com"),
                Some("octocat"),
            )
            .expect("queue prompt");

        state
            .store_prompt_response(
                &session.session_id,
                &prompt_id,
                Some("octocat"),
                Some("secret"),
                false,
                false,
            )
            .expect("store response");

        {
            let mut notifiers = state.notifiers.lock().expect("notifiers lock");
            notifiers.insert(
                (session.session_id.clone(), prompt_id.clone()),
                Arc::new(Notify::new()),
            );
        }

        let removed = state.remove_session(&session.session_id);

        assert!(removed);
        assert!(state
            .prompts
            .lock()
            .expect("prompts lock")
            .get(&session.session_id)
            .is_none());
        assert!(state
            .responses
            .lock()
            .expect("responses lock")
            .get(&session.session_id)
            .is_none());
        assert!(state
            .notifiers
            .lock()
            .expect("notifiers lock")
            .keys()
            .all(|(session_id, _)| session_id != &session.session_id));
    }

    #[test]
    fn remove_session_should_return_false_when_session_does_not_exist() {
        let state = GitAuthBrokerState::default();

        let removed = state.remove_session("non-existent-session-id");

        assert!(!removed);
    }

    #[test]
    fn session_cleanup_guard_should_remove_session_on_drop() {
        let state = GitAuthBrokerState::default();
        let session = state.create_session("clone").expect("session");
        let session_id = session.session_id.clone();

        {
            let _guard = SessionCleanupGuard::new(&state, session_id.clone());
            assert!(state.verify_session_secret(&session_id, &session.secret));
        }

        assert!(!state.verify_session_secret(&session_id, &session.secret));
    }

    #[test]
    fn session_cleanup_guard_disarm_should_keep_session() {
        let state = GitAuthBrokerState::default();
        let session = state.create_session("clone").expect("session");
        let session_id = session.session_id.clone();

        {
            let mut guard = SessionCleanupGuard::new(&state, session_id.clone());
            guard.disarm();
        }

        assert!(state.verify_session_secret(&session_id, &session.secret));
        let _ = state.remove_session(&session_id);
    }

    #[test]
    fn store_and_take_prompt_response_should_work_correctly() {
        let state = GitAuthBrokerState::default();
        let session = state.create_session("fetch").expect("session");
        let prompt_id = state
            .queue_prompt(&session.session_id, "Password:", Some("host"), Some("user"))
            .expect("queue prompt");

        // Store a response
        state
            .store_prompt_response(
                &session.session_id,
                &prompt_id,
                Some("myuser"),
                Some("mypassword"),
                true,
                false,
            )
            .expect("store response");

        // Take the response
        let response = state
            .take_prompt_response(&session.session_id, &prompt_id)
            .expect("response should exist");

        assert_eq!(response.username.as_deref(), Some("myuser"));
        assert_eq!(response.secret.as_deref(), Some("mypassword"));
        assert!(response.remember);
        assert!(!response.cancelled);

        // Taking again should return None (response was removed)
        let second_take = state.take_prompt_response(&session.session_id, &prompt_id);
        assert!(second_take.is_none());
    }

    #[test]
    fn store_and_take_cancelled_response_should_work_correctly() {
        let state = GitAuthBrokerState::default();
        let session = state.create_session("fetch").expect("session");
        let prompt_id = state
            .queue_prompt(&session.session_id, "Password:", None, None)
            .expect("queue prompt");

        // Store a cancelled response
        state
            .store_prompt_response(&session.session_id, &prompt_id, None, None, false, true)
            .expect("store response");

        let response = state
            .take_prompt_response(&session.session_id, &prompt_id)
            .expect("response should exist");

        assert!(response.cancelled);
        assert!(!response.remember);
    }

    #[test]
    fn take_last_prompt_response_should_return_most_recent() {
        let state = GitAuthBrokerState::default();
        let session = state.create_session("push").expect("session");

        // Queue two prompts and respond to both
        let first_prompt = state
            .queue_prompt(&session.session_id, "Username:", None, None)
            .expect("queue first");
        let second_prompt = state
            .queue_prompt(&session.session_id, "Password:", None, None)
            .expect("queue second");

        // Store responses in order
        state
            .store_prompt_response(
                &session.session_id,
                &first_prompt,
                Some("user1"),
                None,
                false,
                false,
            )
            .expect("store first");
        state
            .store_prompt_response(
                &session.session_id,
                &second_prompt,
                None,
                Some("pass123"),
                true,
                false,
            )
            .expect("store second");

        // Take last should return the second response
        let last = state
            .take_last_prompt_response(&session.session_id)
            .expect("should get last response");

        assert_eq!(last.secret.as_deref(), Some("pass123"));
        assert!(last.remember);

        // Taking last again should return the first response
        let first = state
            .take_last_prompt_response(&session.session_id)
            .expect("should get first response");

        assert_eq!(first.username.as_deref(), Some("user1"));
    }

    #[tokio::test]
    async fn wait_for_prompt_response_should_succeed_after_notification() {
        let state = GitAuthBrokerState::default();
        let session = state.create_session("fetch").expect("session");
        let prompt_id = state
            .queue_prompt(&session.session_id, "Password:", None, None)
            .expect("queue prompt");

        let state_clone = state.clone();
        let session_id = session.session_id.clone();
        let prompt_id_clone = prompt_id.clone();

        tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(50)).await;
            state_clone
                .store_prompt_response(
                    &session_id,
                    &prompt_id_clone,
                    Some("user"),
                    Some("pass"),
                    false,
                    false,
                )
                .expect("store response");
        });

        let response = state
            .wait_for_prompt_response(&session.session_id, &prompt_id, Duration::from_secs(1))
            .await
            .expect("should get response");

        assert_eq!(response.secret.as_deref(), Some("pass"));
    }

    #[tokio::test]
    async fn wait_for_prompt_response_should_remove_notifier_after_timeout() {
        let state = GitAuthBrokerState::default();
        let session = state.create_session("fetch").expect("session");
        let prompt_id = state
            .queue_prompt(&session.session_id, "Password:", None, None)
            .expect("queue prompt");

        let response = state
            .wait_for_prompt_response(&session.session_id, &prompt_id, Duration::from_millis(5))
            .await;

        assert!(response.is_none());
        assert!(state
            .notifiers
            .lock()
            .expect("notifiers lock")
            .get(&(session.session_id.clone(), prompt_id))
            .is_none());
    }

    #[test]
    fn take_prompt_response_should_return_none_for_invalid_ids() {
        let state = GitAuthBrokerState::default();
        let session = state.create_session("clone").expect("session");

        // Try to take a response that was never stored
        let response = state.take_prompt_response(&session.session_id, "invalid-prompt-id");
        assert!(response.is_none());

        // Try with invalid session
        let response = state.take_prompt_response("invalid-session", "any-prompt");
        assert!(response.is_none());
    }

    #[test]
    fn take_last_prompt_response_should_return_none_when_no_responses() {
        let state = GitAuthBrokerState::default();
        let session = state.create_session("clone").expect("session");

        let response = state.take_last_prompt_response(&session.session_id);
        assert!(response.is_none());
    }
}
