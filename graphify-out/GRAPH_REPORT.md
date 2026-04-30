# Graph Report - LitGit  (2026-04-30)

## Corpus Check
- 259 files · ~215,253 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2608 nodes · 5091 edges · 69 communities detected
- Extraction: 85% EXTRACTED · 15% INFERRED · 0% AMBIGUOUS · INFERRED: 777 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 37|Community 37]]
- [[_COMMUNITY_Community 40|Community 40]]
- [[_COMMUNITY_Community 41|Community 41]]
- [[_COMMUNITY_Community 43|Community 43]]
- [[_COMMUNITY_Community 44|Community 44]]
- [[_COMMUNITY_Community 45|Community 45]]
- [[_COMMUNITY_Community 46|Community 46]]
- [[_COMMUNITY_Community 47|Community 47]]
- [[_COMMUNITY_Community 48|Community 48]]
- [[_COMMUNITY_Community 49|Community 49]]
- [[_COMMUNITY_Community 52|Community 52]]
- [[_COMMUNITY_Community 54|Community 54]]
- [[_COMMUNITY_Community 55|Community 55]]
- [[_COMMUNITY_Community 56|Community 56]]
- [[_COMMUNITY_Community 59|Community 59]]
- [[_COMMUNITY_Community 60|Community 60]]
- [[_COMMUNITY_Community 62|Community 62]]
- [[_COMMUNITY_Community 71|Community 71]]
- [[_COMMUNITY_Community 72|Community 72]]
- [[_COMMUNITY_Community 73|Community 73]]
- [[_COMMUNITY_Community 74|Community 74]]
- [[_COMMUNITY_Community 75|Community 75]]
- [[_COMMUNITY_Community 77|Community 77]]
- [[_COMMUNITY_Community 78|Community 78]]
- [[_COMMUNITY_Community 82|Community 82]]
- [[_COMMUNITY_Community 83|Community 83]]
- [[_COMMUNITY_Community 88|Community 88]]
- [[_COMMUNITY_Community 92|Community 92]]
- [[_COMMUNITY_Community 116|Community 116]]
- [[_COMMUNITY_Community 117|Community 117]]
- [[_COMMUNITY_Community 118|Community 118]]
- [[_COMMUNITY_Community 119|Community 119]]
- [[_COMMUNITY_Community 149|Community 149]]
- [[_COMMUNITY_Community 202|Community 202]]
- [[_COMMUNITY_Community 203|Community 203]]
- [[_COMMUNITY_Community 204|Community 204]]
- [[_COMMUNITY_Community 205|Community 205]]

## God Nodes (most connected - your core abstractions)
1. `getTauriInvoke()` - 84 edges
2. `validate_git_repo()` - 43 edges
3. `git_command()` - 40 edges
4. `git_error_message()` - 28 edges
5. `run_git_output()` - 23 edges
6. `load_integrations_config()` - 22 edges
7. `save_integrations_config()` - 22 edges
8. `push_repository_branch_inner()` - 21 edges
9. `clone_git_repository()` - 19 edges
10. `isRecord()` - 19 edges

## Surprising Connections (you probably didn't know these)
- `main()` --calls--> `String`  [INFERRED]
  scripts/bump-skills.mjs → apps/desktop/src-tauri/src/git_support.rs
- `Checkbox()` --calls--> `confirmMajorBumps()`  [INFERRED]
  packages/ui/src/components/checkbox.tsx → scripts/bump-deps.mjs
- `TailwindCSS` --references--> `OAuth Success Page`  [INFERRED]
  README.md → apps/desktop/public/oauth-success.html
- `LitGit Desktop` --references--> `AUR Packaging Binary`  [INFERRED]
  README.md → packaging/aur/README.md
- `LitGit Desktop` --conceptually_related_to--> `LitGit Desktop HTML Entry Page`  [INFERRED]
  README.md → apps/desktop/index.html

## Hyperedges (group relationships)
- **LitGit Desktop Stack** — readme_litgit_desktop, readme_react, readme_tanstack_router, readme_tauri, readme_tailwindcss [EXTRACTED 1.00]
- **OAuth Success Handoff Flow** — oauth_success_provider_template, oauth_success_handoff_token_template, oauth_success_deep_link_template, oauth_success_token_input, oauth_success_copy_token_button, oauth_success_window_location [EXTRACTED 1.00]
- **AUR Binary Release Packaging** — readme_aur_packaging_binary, readme_github_releases_deb_asset, readme_pkgbuild, readme_litgit_desktop_bin, readme_srcinfo, readme_makepkg [EXTRACTED 1.00]

## Communities

### Community 0 - "Community 0"
Cohesion: 0.02
Nodes (181): create_repository_branch_at_reference_inner(), create_repository_branch_inner(), delete_repository_branch_inner(), ensure_output_success(), get_repository_branches_inner(), get_repository_remote_names_inner(), rename_repository_branch_inner(), run_repo_git_output() (+173 more)

### Community 1 - "Community 1"
Cohesion: 0.02
Nodes (161): isNullableNumber(), isNullableString(), isPreviewGate(), isPreviewMode(), isRecord(), isViewerKind(), parseDiffContentBase(), parseFilePreflightBase() (+153 more)

### Community 2 - "Community 2"
Cohesion: 0.04
Nodes (131): delete_remote_repository_branch_inner(), background_command(), build_git_credential_descriptor(), git_command(), git_credential_approve(), git_credential_fill(), git_credential_reject(), git_error_message() (+123 more)

### Community 3 - "Community 3"
Cohesion: 0.02
Nodes (78): KeyboardShortcutsDialog(), getChangeRepositoryShortcutKeys(), getCloseTabShortcutLabel(), getCommandPaletteShortcutLabel(), getKeyboardShortcutsShortcutLabel(), getNewTabShortcutLabel(), getNextTabShortcutLabel(), getOpenRepositoryShortcutLabel() (+70 more)

### Community 4 - "Community 4"
Cohesion: 0.04
Nodes (111): String, apply_kde_child_environment(), apply_kde_child_environment_sets_expected_overrides(), assert_linux_file_manager_strategy(), assert_linux_file_manager_strategy_from_path(), assert_terminal_candidate_prefix(), assert_terminal_candidates_have_no_duplicates(), assert_windows_terminal_candidate_prefix() (+103 more)

### Community 5 - "Community 5"
Cohesion: 0.04
Nodes (119): ai_http_agent(), ai_request_kind_label(), AiCommitGenerationChunkPayload, AiCommitGenerationProgressPayload, AiModelInfo, AiRequestKind, build_commit_generation_prompt(), build_commit_generation_prompt_with_budget() (+111 more)

### Community 6 - "Community 6"
Cohesion: 0.03
Nodes (72): bind_loopback_callback_listener(), build_deep_link_callback_url(), build_loopback_redirect_uri(), build_oauth_error_page(), build_oauth_success_page(), complete_oauth_flow(), complete_oauth_handoff_redeems_token_to_staged_callback(), disconnect_provider() (+64 more)

### Community 7 - "Community 7"
Cohesion: 0.03
Nodes (99): AskpassSocketPath, create_windows_pipe(), error_response_serializes_correctly(), ErrorResponse, FailingPayload, GetResponseRequest, handle_get_response(), handle_unix_connection() (+91 more)

### Community 8 - "Community 8"
Cohesion: 0.05
Nodes (79): random_token(), askpass_session_accepts_correct_secret(), askpass_session_creation_returns_distinct_session_ids(), askpass_session_rejects_wrong_secret(), GitAuthBrokerState, GitAuthPromptContext, GitAuthPromptRecord, GitAuthPromptResponse (+71 more)

### Community 9 - "Community 9"
Cohesion: 0.03
Nodes (76): existing_repo_network_commands_can_apply_auth_session_env(), apply_auth_session_environment(), apply_auth_session_environment_clears_existing_askpass(), apply_auth_session_environment_from_snapshot(), apply_auth_session_environment_rejects_missing_socket_path(), apply_existing_git_preferences(), apply_existing_git_preferences_from_snapshot(), apply_git_preferences() (+68 more)

### Community 10 - "Community 10"
Cohesion: 0.05
Nodes (55): BranchError, create_repository_branch(), create_repository_branch_at_reference(), create_repository_branch_at_reference_uses_requested_target(), create_repository_branch_creates_a_new_branch(), create_repository_branch_rejects_duplicate_names(), delete_remote_repository_branch(), delete_remote_repository_branch_removes_branch_from_remote() (+47 more)

### Community 11 - "Community 11"
Cohesion: 0.06
Nodes (59): blame_parser_maps_line_porcelain_rows(), BlameLineBuilder, build_file_blame_cache_key(), build_file_history_cache_key(), CachedPayloadEntry, clone_diff_workspace_settings_state(), create_temp_dir(), detect_repository_file_encoding() (+51 more)

### Community 12 - "Community 12"
Cohesion: 0.09
Nodes (60): add_repository_ignore_rule(), add_repository_ignore_rule_appends_pattern_once(), add_repository_ignore_rule_inner(), add_repository_ignore_rule_returns_error_when_existing_gitignore_is_not_utf8(), create_temp_git_repo(), create_temp_git_repo_with_commit(), discard_all_repository_changes(), discard_all_repository_changes_inner() (+52 more)

### Community 13 - "Community 13"
Cohesion: 0.1
Nodes (33): binary_gate_wins_over_size_gate(), build_content_payload(), build_preflight_metadata(), compute_changed_line_count(), count_text_lines(), get_repository_commit_file_content(), get_repository_commit_file_content_inner(), get_repository_commit_file_content_returns_old_and_new_text_for_commit_diff() (+25 more)

### Community 14 - "Community 14"
Cohesion: 0.07
Nodes (29): initialize_github_identity_cache(), oauth_deep_link_round_trip_confirms_only_matching_staged_callback(), OAuthDeepLinkPayload, parse_oauth_deep_link(), parse_oauth_deep_link_returns_handoff_token(), RepositoryCommitFileDiff, RepositoryFileDiff, run() (+21 more)

### Community 15 - "Community 15"
Cohesion: 0.08
Nodes (33): completeOAuthFlow(), disconnectProvider(), emitProviderStatusChanged(), generateProviderSshKey(), getProviderStatus(), parseOAuthCallbackUrl(), redeemOAuthHandoffToken(), removeProviderSshKey() (+25 more)

### Community 16 - "Community 16"
Cohesion: 0.05
Nodes (40): App Mount Element, LitGit Desktop HTML Entry Page, Copy Token Button, DEEP_LINK Template Token, Google Fonts Geist, HANDOFF_TOKEN Template Token, LitGit Logo, OAuth Success Page (+32 more)

### Community 17 - "Community 17"
Cohesion: 0.09
Nodes (21): askpass_env_lock(), connect_to_server(), ErrorResponse, extract_host_from_prompt(), extract_username_from_prompt(), main(), PromptResponse, QueuePromptRequest (+13 more)

### Community 18 - "Community 18"
Cohesion: 0.06
Nodes (12): useLauncherActions(), fromGroupSortableId(), useTabBarDnd(), useTabBarScroll(), useTabBarShortcuts(), useTabBarStoreState(), TabBar(), useGroupHoverIntent() (+4 more)

### Community 19 - "Community 19"
Cohesion: 0.13
Nodes (29): Checkbox(), applyUpdates(), checkForUpdates(), collectDependencies(), confirmMajorBumps(), createPackageBrowserUrl(), detectVersionType(), fetchPackageInfo() (+21 more)

### Community 20 - "Community 20"
Cohesion: 0.11
Nodes (21): allow_remember_for_kind(), classify_prompt_kind(), create_temp_home_dir(), emit_git_auth_prompt(), GitAuthPromptPayload, handle_queue_prompt(), normalize_optional_input(), provider_key_from_host() (+13 more)

### Community 21 - "Community 21"
Cohesion: 0.13
Nodes (24): canonicalize_if_exists(), copy_public_key(), default_ssh_dir(), default_ssh_dir_returns_ssh_subdirectory(), delete_ssh_key(), ensure_ssh_dir(), generate_litgit_key_with_dialog_inner(), generate_ssh_key() (+16 more)

### Community 22 - "Community 22"
Cohesion: 0.15
Nodes (17): adjustPreviewSidebarWidth(), clampPreviewWidthToViewport(), handlePointerMove(), handlePreviewResizeHandleKeyDown(), startPreviewResize(), adjustPreviewSidebarWidth(), clampPreviewWidthToViewport(), handlePointerMove() (+9 more)

### Community 23 - "Community 23"
Cohesion: 0.08
Nodes (11): CodeEditor(), createBehaviorExtensions(), createBlameExtension(), createEditExtensions(), createReadOnlyExtensions(), isViewMode(), blameGutterExtension(), BlameMarker (+3 more)

### Community 24 - "Community 24"
Cohesion: 0.15
Nodes (20): close_terminal_session(), close_terminal_session_inner(), create_temp_dir(), create_temp_path(), create_terminal_session(), create_terminal_session_inner(), default_shell(), remove_temp_path() (+12 more)

### Community 25 - "Community 25"
Cohesion: 0.13
Nodes (14): buildRepoInfoAllFilesModel(), buildRepoInfoCommitFilesModel(), summarizeSelectedFiles(), buildChangeTree(), buildCommitFileTree(), buildRepositoryFileTree(), collectCommitTreeChangeSummary(), collectTreeStatusCounts() (+6 more)

### Community 27 - "Community 27"
Cohesion: 0.13
Nodes (6): notifyRepoLoadErrors(), notifyRepoLoadErrorsForMode(), setRepoLoadingFlags(), setRepoLoadingFlagsForMode(), resolveErrorMessage(), resolveErrorSummary()

### Community 28 - "Community 28"
Cohesion: 0.2
Nodes (14): buildGitGraphLayout(), createEdge(), createNode(), getCommitLaneColor(), getLaneColor(), projectVisibleGitGraph(), resolveCommitLane(), resolveCommitLaneColor() (+6 more)

### Community 30 - "Community 30"
Cohesion: 0.21
Nodes (6): createDefaultState(), migrateFromRepoStore(), moveItemInArray(), reorderTabsWithinGroup(), applyMigratedOrDefaultState(), rehydrateTabStore()

### Community 31 - "Community 31"
Cohesion: 0.21
Nodes (6): formatActivityLogLine(), formatLogTimestamp(), formatSystemLogLine(), getSelectedTextInContainer(), getSystemLogDetail(), updateSelectedText()

### Community 33 - "Community 33"
Cohesion: 0.23
Nodes (8): useRootAutoFetchIntervalMinutes(), useRootOnboardingPreferences(), useRootSchedulerPreferences(), useRootThemePreference(), useRootToasterPosition(), useRootActiveRepoContext(), RootComponent(), RootPreferenceEffects()

### Community 36 - "Community 36"
Cohesion: 0.24
Nodes (6): ImageZoom(), clampPosition(), getBoundedImagePanPosition(), isImageZoomModifierHeld(), resolveImageZoomCursor(), resolveModifierHeldFromKeyboardEvent()

### Community 37 - "Community 37"
Cohesion: 0.22
Nodes (4): createTrailingWhitespaceExtension(), createTrailingWhitespacePlugin(), TrailingSpaceWidget, TrailingTabWidget

### Community 40 - "Community 40"
Cohesion: 0.25
Nodes (3): GitAuthDialog(), detectGitProvider(), resolveOAuthProviderForPrompt()

### Community 41 - "Community 41"
Cohesion: 0.33
Nodes (5): handleBranchNameKeyDown(), handleBranchSelection(), handleCreateBranch(), isBranchPaletteAction(), itemToStringLabel()

### Community 43 - "Community 43"
Cohesion: 0.32
Nodes (3): buildZoomSteps(), formatZoomLabel(), isCloseToFit()

### Community 44 - "Community 44"
Cohesion: 0.46
Nodes (6): buildSkillsAddArgs(), formatSkillsAddCommand(), main(), parseSkillsLock(), runCommand(), selectLockedSkills()

### Community 45 - "Community 45"
Cohesion: 0.43
Nodes (4): getRepoRedoStack(), getRepoUndoStack(), recordRepoHistoryEntry(), updateRepoHistoryState()

### Community 46 - "Community 46"
Cohesion: 0.46
Nodes (7): isValidBitbucketUsername(), isValidGitHubUsername(), resolveBitbucketAvatarFromIdentityEmail(), resolveCommitAuthorAvatarFromIdentityEmail(), resolveGitHubAvatarFromIdentityEmail(), resolveGitLabAvatarFromIdentityEmail(), resolveWipAuthorAvatarUrl()

### Community 47 - "Community 47"
Cohesion: 0.29
Nodes (3): countVisibleChangeTreeNodes(), countVisibleCommitTreeNodes(), buildRepoInfoVisibleCountsModel()

### Community 48 - "Community 48"
Cohesion: 0.48
Nodes (6): closeConfirmDialog(), closePopoverMenu(), handleCloseGroupClick(), handleConfirmAction(), handleNewTab(), handleUngroupClick()

### Community 49 - "Community 49"
Cohesion: 0.43
Nodes (5): buildBranchTree(), buildRepoInfoSidebarGroups(), countBranchTreeEntries(), createEmptyBranchTreeNode(), filterBranchTree()

### Community 52 - "Community 52"
Cohesion: 0.33
Nodes (2): createLanguageSupport(), loadLanguageSupport()

### Community 54 - "Community 54"
Cohesion: 0.4
Nodes (2): toDateLabel(), toRelativeDateLabel()

### Community 55 - "Community 55"
Cohesion: 0.47
Nodes (4): RootShell(), getRuntimeWindowChromeMode(), normalizeWindowChromeMode(), shouldUseWindowTitlebar()

### Community 56 - "Community 56"
Cohesion: 0.53
Nodes (5): buildLocaleOption(), getLocaleDisplayNames(), getLocaleOption(), getLocaleOptions(), getRegionDisplayNames()

### Community 59 - "Community 59"
Cohesion: 0.7
Nodes (4): buildRepoInfoReferenceModel(), createSidebarEntryFromRefName(), formatStashLabel(), normalizeCommitRefLabel()

### Community 60 - "Community 60"
Cohesion: 0.7
Nodes (4): buildRepoInfoTimelineRows(), formatStashLabel(), normalizeCommitRefLabel(), resolveTagNameFromCommitRef()

### Community 62 - "Community 62"
Cohesion: 0.6
Nodes (3): formatMegabytes(), resolveDiffPreviewUiState(), resolveGuardCopy()

### Community 71 - "Community 71"
Cohesion: 0.83
Nodes (3): isDiffWorkspaceTextEncodingUnsupported(), resolveDiffWorkspaceEncodingValue(), resolveDiffWorkspaceRequestedEncoding()

### Community 72 - "Community 72"
Cohesion: 0.67
Nodes (2): toDateLabel(), toRelativeDateLabel()

### Community 73 - "Community 73"
Cohesion: 0.83
Nodes (3): isBlockBoundary(), parseFenceInfo(), parseMarkdownBlocks()

### Community 74 - "Community 74"
Cohesion: 0.83
Nodes (3): loadGitignoreTemplates(), loadLicenseTemplates(), loadRepositoryTemplates()

### Community 75 - "Community 75"
Cohesion: 0.5
Nodes (2): GlobalGitAuthDialog(), useGitAuthPrompts()

### Community 77 - "Community 77"
Cohesion: 1.0
Nodes (2): main(), runCommand()

### Community 78 - "Community 78"
Cohesion: 1.0
Nodes (2): appendEntry(), createEntryId()

### Community 82 - "Community 82"
Cohesion: 1.0
Nodes (2): createEditorChromeTheme(), createThemeExtension()

### Community 83 - "Community 83"
Cohesion: 1.0
Nodes (2): buildMonacoModelBasePath(), normalizeModelFilePath()

### Community 88 - "Community 88"
Cohesion: 1.0
Nodes (2): groupCommands(), searchHeaderTabsPalette()

### Community 92 - "Community 92"
Cohesion: 0.67
Nodes (3): Desktop Database Hooks, Icon Cache Hooks, litgit-desktop-bin.install

### Community 116 - "Community 116"
Cohesion: 1.0
Nodes (1): String

### Community 117 - "Community 117"
Cohesion: 1.0
Nodes (1): String

### Community 118 - "Community 118"
Cohesion: 1.0
Nodes (1): String

### Community 119 - "Community 119"
Cohesion: 1.0
Nodes (1): String

### Community 149 - "Community 149"
Cohesion: 1.0
Nodes (2): Desktop Development Commands, Vite Desktop Preview

### Community 202 - "Community 202"
Cohesion: 1.0
Nodes (1): GitHub Provider Icon

### Community 203 - "Community 203"
Cohesion: 1.0
Nodes (1): GitLab Provider Icon

### Community 204 - "Community 204"
Cohesion: 1.0
Nodes (1): Bitbucket Provider Icon

### Community 205 - "Community 205"
Cohesion: 1.0
Nodes (1): Default Provider Icon

## Knowledge Gaps
- **178 isolated node(s):** `RepositoryError`, `String`, `PickedRepository`, `PickedFilePath`, `CloneRepositoryProgress` (+173 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 52`** (6 nodes): `language-support.ts`, `language-resolver.ts`, `createLanguageSupport()`, `loadLanguageSupport()`, `resolveFenceLanguage()`, `resolveLanguage()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 54`** (6 nodes): `diff-workspace-blame-surface.tsx`, `DiffWorkspaceBlameSurface()`, `resolveAuthorColor()`, `resolveAvatarLabel()`, `toDateLabel()`, `toRelativeDateLabel()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 72`** (4 nodes): `diff-workspace-history-surface.tsx`, `resolveAvatarLabel()`, `toDateLabel()`, `toRelativeDateLabel()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 75`** (4 nodes): `global-git-auth-dialog.tsx`, `use-git-auth-prompts.ts`, `GlobalGitAuthDialog()`, `useGitAuthPrompts()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 77`** (3 nodes): `main()`, `cleanup.mjs`, `runCommand()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 78`** (3 nodes): `use-operation-log-store.ts`, `appendEntry()`, `createEntryId()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 82`** (3 nodes): `theme-extension.ts`, `createEditorChromeTheme()`, `createThemeExtension()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 83`** (3 nodes): `model-path.ts`, `buildMonacoModelBasePath()`, `normalizeModelFilePath()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 88`** (3 nodes): `header-tabs-search-search.ts`, `groupCommands()`, `searchHeaderTabsPalette()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 116`** (2 nodes): `String`, `.from()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 117`** (2 nodes): `String`, `.from()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 118`** (2 nodes): `String`, `.from()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 119`** (2 nodes): `String`, `.from()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 149`** (2 nodes): `Desktop Development Commands`, `Vite Desktop Preview`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 202`** (1 nodes): `GitHub Provider Icon`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 203`** (1 nodes): `GitLab Provider Icon`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 204`** (1 nodes): `Bitbucket Provider Icon`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 205`** (1 nodes): `Default Provider Icon`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `git_command()` connect `Community 2` to `Community 0`, `Community 5`, `Community 8`, `Community 9`, `Community 10`, `Community 11`, `Community 13`?**
  _High betweenness centrality (0.026) - this node is a cross-community bridge._
- **Why does `load_integrations_config()` connect `Community 7` to `Community 0`, `Community 5`, `Community 6`, `Community 8`, `Community 10`, `Community 11`, `Community 20`?**
  _High betweenness centrality (0.012) - this node is a cross-community bridge._
- **Why does `run_git_output()` connect `Community 12` to `Community 0`, `Community 2`, `Community 11`?**
  _High betweenness centrality (0.012) - this node is a cross-community bridge._
- **Are the 26 inferred relationships involving `getTauriInvoke()` (e.g. with `getSettingsBackendCapabilities()` and `listStoredHttpCredentialEntries()`) actually correct?**
  _`getTauriInvoke()` has 26 INFERRED edges - model-reasoned connections that need verification._
- **Are the 37 inferred relationships involving `validate_git_repo()` (e.g. with `get_repository_history_inner()` and `get_latest_repository_commit_message_inner()`) actually correct?**
  _`validate_git_repo()` has 37 INFERRED edges - model-reasoned connections that need verification._
- **Are the 34 inferred relationships involving `git_command()` (e.g. with `run_clone_command()` and `git_output()`) actually correct?**
  _`git_command()` has 34 INFERRED edges - model-reasoned connections that need verification._
- **Are the 22 inferred relationships involving `git_error_message()` (e.g. with `clone_git_repository()` and `initialize_git_repository()`) actually correct?**
  _`git_error_message()` has 22 INFERRED edges - model-reasoned connections that need verification._