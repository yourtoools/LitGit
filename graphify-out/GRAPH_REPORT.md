# Graph Report - LitGit  (2026-05-02)

## Corpus Check
- 255 files · ~1,096,789 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2542 nodes · 5005 edges · 70 communities detected
- Extraction: 84% EXTRACTED · 16% INFERRED · 0% AMBIGUOUS · INFERRED: 786 edges (avg confidence: 0.8)
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
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 37|Community 37]]
- [[_COMMUNITY_Community 38|Community 38]]
- [[_COMMUNITY_Community 41|Community 41]]
- [[_COMMUNITY_Community 42|Community 42]]
- [[_COMMUNITY_Community 44|Community 44]]
- [[_COMMUNITY_Community 45|Community 45]]
- [[_COMMUNITY_Community 46|Community 46]]
- [[_COMMUNITY_Community 47|Community 47]]
- [[_COMMUNITY_Community 48|Community 48]]
- [[_COMMUNITY_Community 49|Community 49]]
- [[_COMMUNITY_Community 50|Community 50]]
- [[_COMMUNITY_Community 53|Community 53]]
- [[_COMMUNITY_Community 54|Community 54]]
- [[_COMMUNITY_Community 55|Community 55]]
- [[_COMMUNITY_Community 58|Community 58]]
- [[_COMMUNITY_Community 59|Community 59]]
- [[_COMMUNITY_Community 60|Community 60]]
- [[_COMMUNITY_Community 62|Community 62]]
- [[_COMMUNITY_Community 67|Community 67]]
- [[_COMMUNITY_Community 70|Community 70]]
- [[_COMMUNITY_Community 71|Community 71]]
- [[_COMMUNITY_Community 72|Community 72]]
- [[_COMMUNITY_Community 73|Community 73]]
- [[_COMMUNITY_Community 75|Community 75]]
- [[_COMMUNITY_Community 76|Community 76]]
- [[_COMMUNITY_Community 80|Community 80]]
- [[_COMMUNITY_Community 81|Community 81]]
- [[_COMMUNITY_Community 86|Community 86]]
- [[_COMMUNITY_Community 90|Community 90]]
- [[_COMMUNITY_Community 113|Community 113]]
- [[_COMMUNITY_Community 114|Community 114]]
- [[_COMMUNITY_Community 115|Community 115]]
- [[_COMMUNITY_Community 116|Community 116]]
- [[_COMMUNITY_Community 144|Community 144]]
- [[_COMMUNITY_Community 194|Community 194]]
- [[_COMMUNITY_Community 195|Community 195]]
- [[_COMMUNITY_Community 196|Community 196]]
- [[_COMMUNITY_Community 197|Community 197]]

## God Nodes (most connected - your core abstractions)
1. `getTauriInvoke()` - 83 edges
2. `validate_git_repo()` - 43 edges
3. `git_command()` - 40 edges
4. `git_error_message()` - 28 edges
5. `run_git_output()` - 23 edges
6. `load_integrations_config()` - 22 edges
7. `save_integrations_config()` - 22 edges
8. `push_repository_branch_inner()` - 21 edges
9. `clone_git_repository()` - 19 edges
10. `run_repo_git_output()` - 18 edges

## Surprising Connections (you probably didn't know these)
- `main()` --calls--> `String`  [INFERRED]
  scripts/bump-skills.mjs → apps/desktop/src-tauri/src/git_support.rs
- `Checkbox()` --calls--> `confirmMajorBumps()`  [INFERRED]
  packages/ui/src/components/checkbox.tsx → scripts/bump-deps.mjs
- `Avatar()` --calls--> `useReducerState()`  [INFERRED]
  packages/ui/src/components/avatar.tsx → apps/desktop/src/hooks/use-reducer-state.ts
- `TailwindCSS` --references--> `OAuth Success Page`  [INFERRED]
  README.md → apps/desktop/public/oauth-success.html
- `refreshRepoGitIdentity()` --calls--> `getRepoGitIdentity()`  [INFERRED]
  apps/desktop/src/stores/repo/repo-loader.slice.ts → apps/desktop/src/lib/tauri-repo-client.ts

## Hyperedges (group relationships)
- **LitGit Desktop Stack** — readme_litgit_desktop, readme_react, readme_tanstack_router, readme_tauri, readme_tailwindcss [EXTRACTED 1.00]
- **OAuth Success Handoff Flow** — oauth_success_provider_template, oauth_success_handoff_token_template, oauth_success_deep_link_template, oauth_success_token_input, oauth_success_copy_token_button, oauth_success_window_location [EXTRACTED 1.00]
- **AUR Binary Release Packaging** — readme_aur_packaging_binary, readme_github_releases_deb_asset, readme_pkgbuild, readme_litgit_desktop_bin, readme_srcinfo, readme_makepkg [EXTRACTED 1.00]

## Communities

### Community 0 - "Community 0"
Cohesion: 0.02
Nodes (186): create_repository_branch_at_reference_inner(), create_repository_branch_inner(), delete_repository_branch_inner(), ensure_output_success(), get_repository_branches_inner(), get_repository_remote_names_inner(), rename_repository_branch_inner(), run_repo_git_output() (+178 more)

### Community 1 - "Community 1"
Cohesion: 0.02
Nodes (160): isNullableNumber(), isNullableString(), isPreviewGate(), isPreviewMode(), isRecord(), isViewerKind(), parseDiffContentBase(), parseFilePreflightBase() (+152 more)

### Community 2 - "Community 2"
Cohesion: 0.03
Nodes (119): allow_remember_for_kind(), classify_prompt_kind(), create_temp_home_dir(), GitAuthPromptPayload, AskpassSocketPath, create_windows_pipe(), error_response_serializes_correctly(), ErrorResponse (+111 more)

### Community 3 - "Community 3"
Cohesion: 0.04
Nodes (111): String, apply_kde_child_environment(), apply_kde_child_environment_sets_expected_overrides(), assert_linux_file_manager_strategy(), assert_linux_file_manager_strategy_from_path(), assert_terminal_candidate_prefix(), assert_terminal_candidates_have_no_duplicates(), assert_windows_terminal_candidate_prefix() (+103 more)

### Community 4 - "Community 4"
Cohesion: 0.04
Nodes (120): ai_http_agent(), ai_request_kind_label(), AiCommitGenerationChunkPayload, AiCommitGenerationProgressPayload, AiModelInfo, AiRequestKind, build_commit_generation_prompt(), build_commit_generation_prompt_with_budget() (+112 more)

### Community 5 - "Community 5"
Cohesion: 0.03
Nodes (72): bind_loopback_callback_listener(), build_deep_link_callback_url(), build_loopback_redirect_uri(), build_oauth_error_page(), build_oauth_success_page(), complete_oauth_flow(), complete_oauth_handoff_redeems_token_to_staged_callback(), disconnect_provider() (+64 more)

### Community 6 - "Community 6"
Cohesion: 0.06
Nodes (87): delete_remote_repository_branch_inner(), run_repo_git_status(), set_repository_branch_upstream_inner(), run_git_text_command(), background_command(), git_command(), git_credential_approve(), git_credential_reject() (+79 more)

### Community 7 - "Community 7"
Cohesion: 0.05
Nodes (76): random_token(), askpass_session_accepts_correct_secret(), askpass_session_creation_returns_distinct_session_ids(), askpass_session_rejects_wrong_secret(), GitAuthBrokerState, GitAuthPromptContext, GitAuthPromptRecord, GitAuthPromptResponse (+68 more)

### Community 8 - "Community 8"
Cohesion: 0.03
Nodes (76): apply_auth_session_environment(), apply_auth_session_environment_clears_existing_askpass(), apply_auth_session_environment_from_snapshot(), apply_auth_session_environment_rejects_missing_socket_path(), apply_existing_git_preferences(), apply_existing_git_preferences_from_snapshot(), apply_git_preferences(), apply_git_preferences_sets_expected_env_and_config_arguments() (+68 more)

### Community 9 - "Community 9"
Cohesion: 0.05
Nodes (53): BranchError, create_repository_branch(), create_repository_branch_at_reference(), create_repository_branch_at_reference_uses_requested_target(), create_repository_branch_creates_a_new_branch(), create_repository_branch_rejects_duplicate_names(), delete_remote_repository_branch(), delete_remote_repository_branch_removes_branch_from_remote() (+45 more)

### Community 10 - "Community 10"
Cohesion: 0.06
Nodes (59): blame_parser_maps_line_porcelain_rows(), BlameLineBuilder, build_file_blame_cache_key(), build_file_history_cache_key(), CachedPayloadEntry, clone_diff_workspace_settings_state(), create_temp_dir(), detect_repository_file_encoding() (+51 more)

### Community 11 - "Community 11"
Cohesion: 0.09
Nodes (60): add_repository_ignore_rule(), add_repository_ignore_rule_appends_pattern_once(), add_repository_ignore_rule_inner(), add_repository_ignore_rule_returns_error_when_existing_gitignore_is_not_utf8(), create_temp_git_repo(), create_temp_git_repo_with_commit(), discard_all_repository_changes(), discard_all_repository_changes_inner() (+52 more)

### Community 12 - "Community 12"
Cohesion: 0.06
Nodes (49): emit_git_auth_prompt(), git_credential_fill(), ApprovedCloneCredential, clone_git_repository(), clone_prompt_provider_from_url(), CloneExecutionResult, CloneRepositoryProgress, create_initial_commit() (+41 more)

### Community 13 - "Community 13"
Cohesion: 0.05
Nodes (22): adjustPreviewSidebarWidth(), clampPreviewWidthToViewport(), handlePointerMove(), handlePreviewResizeHandleKeyDown(), startPreviewResize(), adjustPreviewSidebarWidth(), clampPreviewWidthToViewport(), handlePointerMove() (+14 more)

### Community 14 - "Community 14"
Cohesion: 0.07
Nodes (39): KeyboardShortcutsDialog(), getChangeRepositoryShortcutKeys(), getCloseTabShortcutLabel(), getCommandPaletteShortcutLabel(), getKeyboardShortcutsShortcutLabel(), getNewTabShortcutLabel(), getNextTabShortcutLabel(), getOpenRepositoryShortcutLabel() (+31 more)

### Community 15 - "Community 15"
Cohesion: 0.07
Nodes (29): initialize_github_identity_cache(), oauth_deep_link_round_trip_confirms_only_matching_staged_callback(), OAuthDeepLinkPayload, parse_oauth_deep_link(), parse_oauth_deep_link_returns_handoff_token(), RepositoryCommitFileDiff, RepositoryFileDiff, run() (+21 more)

### Community 16 - "Community 16"
Cohesion: 0.08
Nodes (32): completeOAuthFlow(), disconnectProvider(), emitProviderStatusChanged(), generateProviderSshKey(), getProviderStatus(), redeemOAuthHandoffToken(), removeProviderSshKey(), resolveOAuthHandoffTokenFromInput() (+24 more)

### Community 17 - "Community 17"
Cohesion: 0.05
Nodes (40): App Mount Element, LitGit Desktop HTML Entry Page, Copy Token Button, DEEP_LINK Template Token, Google Fonts Geist, HANDOFF_TOKEN Template Token, LitGit Logo, OAuth Success Page (+32 more)

### Community 18 - "Community 18"
Cohesion: 0.09
Nodes (21): askpass_env_lock(), connect_to_server(), ErrorResponse, extract_host_from_prompt(), extract_username_from_prompt(), main(), PromptResponse, QueuePromptRequest (+13 more)

### Community 19 - "Community 19"
Cohesion: 0.06
Nodes (12): useLauncherActions(), fromGroupSortableId(), useTabBarDnd(), useTabBarScroll(), useTabBarShortcuts(), useTabBarStoreState(), TabBar(), useGroupHoverIntent() (+4 more)

### Community 20 - "Community 20"
Cohesion: 0.13
Nodes (29): Checkbox(), applyUpdates(), checkForUpdates(), collectDependencies(), confirmMajorBumps(), createPackageBrowserUrl(), detectVersionType(), fetchPackageInfo() (+21 more)

### Community 21 - "Community 21"
Cohesion: 0.13
Nodes (24): canonicalize_if_exists(), copy_public_key(), default_ssh_dir(), default_ssh_dir_returns_ssh_subdirectory(), delete_ssh_key(), ensure_ssh_dir(), generate_litgit_key_with_dialog_inner(), generate_ssh_key() (+16 more)

### Community 22 - "Community 22"
Cohesion: 0.08
Nodes (14): CodeEditor(), CodeEditorImplementation(), createBehaviorExtensions(), createBlameExtension(), createEditExtensions(), createEditorCompartments(), createReadOnlyExtensions(), getEditorCompartments() (+6 more)

### Community 23 - "Community 23"
Cohesion: 0.2
Nodes (25): apply_repository_stash(), apply_repository_stash_inner(), apply_repository_stash_restores_changes_without_dropping_entry(), create_repository_stash(), create_repository_stash_uses_default_branch_message_when_message_is_blank(), create_temp_repository(), drop_repository_stash(), drop_repository_stash_inner() (+17 more)

### Community 24 - "Community 24"
Cohesion: 0.15
Nodes (20): close_terminal_session(), close_terminal_session_inner(), create_temp_dir(), create_temp_path(), create_terminal_session(), create_terminal_session_inner(), default_shell(), remove_temp_path() (+12 more)

### Community 25 - "Community 25"
Cohesion: 0.13
Nodes (14): buildRepoInfoAllFilesModel(), buildRepoInfoCommitFilesModel(), summarizeSelectedFiles(), buildChangeTree(), buildCommitFileTree(), buildRepositoryFileTree(), collectCommitTreeChangeSummary(), collectTreeStatusCounts() (+6 more)

### Community 26 - "Community 26"
Cohesion: 0.13
Nodes (9): getRepoCacheState(), hasCompleteCommitHistory(), notifyRepoLoadErrors(), notifyRepoLoadErrorsForMode(), refreshRepoGitIdentity(), setRepoLoadingFlags(), setRepoLoadingFlagsForMode(), resolveErrorMessage() (+1 more)

### Community 28 - "Community 28"
Cohesion: 0.14
Nodes (6): Avatar(), reducerState(), useReducerState(), useElementSize(), useImageDimensions(), GitIdentityDialog()

### Community 30 - "Community 30"
Cohesion: 0.21
Nodes (6): createDefaultState(), migrateFromRepoStore(), moveItemInArray(), reorderTabsWithinGroup(), applyMigratedOrDefaultState(), rehydrateTabStore()

### Community 31 - "Community 31"
Cohesion: 0.24
Nodes (9): buildGitGraphRows(), buildPassThroughEdges(), getGraphColor(), getOrCreateColorIndex(), resolveActiveLane(), resolveGitGraphRowsWidth(), resolveReferenceColumn(), trimInactiveTail() (+1 more)

### Community 32 - "Community 32"
Cohesion: 0.21
Nodes (6): formatActivityLogLine(), formatLogTimestamp(), formatSystemLogLine(), getSelectedTextInContainer(), getSystemLogDetail(), updateSelectedText()

### Community 34 - "Community 34"
Cohesion: 0.23
Nodes (8): useRootAutoFetchIntervalMinutes(), useRootOnboardingPreferences(), useRootSchedulerPreferences(), useRootThemePreference(), useRootToasterPosition(), useRootActiveRepoContext(), RootComponent(), RootPreferenceEffects()

### Community 37 - "Community 37"
Cohesion: 0.24
Nodes (6): ImageZoom(), clampPosition(), getBoundedImagePanPosition(), isImageZoomModifierHeld(), resolveImageZoomCursor(), resolveModifierHeldFromKeyboardEvent()

### Community 38 - "Community 38"
Cohesion: 0.22
Nodes (4): createTrailingWhitespaceExtension(), createTrailingWhitespacePlugin(), TrailingSpaceWidget, TrailingTabWidget

### Community 41 - "Community 41"
Cohesion: 0.33
Nodes (5): handleBranchNameKeyDown(), handleBranchSelection(), handleCreateBranch(), isBranchPaletteAction(), itemToStringLabel()

### Community 42 - "Community 42"
Cohesion: 0.25
Nodes (3): GitAuthDialog(), detectGitProvider(), resolveOAuthProviderForPrompt()

### Community 44 - "Community 44"
Cohesion: 0.32
Nodes (3): buildZoomSteps(), formatZoomLabel(), isCloseToFit()

### Community 45 - "Community 45"
Cohesion: 0.46
Nodes (6): buildSkillsAddArgs(), formatSkillsAddCommand(), main(), parseSkillsLock(), runCommand(), selectLockedSkills()

### Community 46 - "Community 46"
Cohesion: 0.43
Nodes (4): getRepoRedoStack(), getRepoUndoStack(), recordRepoHistoryEntry(), updateRepoHistoryState()

### Community 47 - "Community 47"
Cohesion: 0.29
Nodes (3): countVisibleChangeTreeNodes(), countVisibleCommitTreeNodes(), buildRepoInfoVisibleCountsModel()

### Community 48 - "Community 48"
Cohesion: 0.46
Nodes (7): isValidBitbucketUsername(), isValidGitHubUsername(), resolveBitbucketAvatarFromIdentityEmail(), resolveCommitAuthorAvatarFromIdentityEmail(), resolveGitHubAvatarFromIdentityEmail(), resolveGitLabAvatarFromIdentityEmail(), resolveWipAuthorAvatarUrl()

### Community 49 - "Community 49"
Cohesion: 0.48
Nodes (6): closeConfirmDialog(), closePopoverMenu(), handleCloseGroupClick(), handleConfirmAction(), handleNewTab(), handleUngroupClick()

### Community 50 - "Community 50"
Cohesion: 0.43
Nodes (5): buildBranchTree(), buildRepoInfoSidebarGroups(), countBranchTreeEntries(), createEmptyBranchTreeNode(), filterBranchTree()

### Community 53 - "Community 53"
Cohesion: 0.4
Nodes (2): toDateLabel(), toRelativeDateLabel()

### Community 54 - "Community 54"
Cohesion: 0.47
Nodes (4): RootShell(), getRuntimeWindowChromeMode(), normalizeWindowChromeMode(), shouldUseWindowTitlebar()

### Community 55 - "Community 55"
Cohesion: 0.53
Nodes (5): buildLocaleOption(), getLocaleDisplayNames(), getLocaleOption(), getLocaleOptions(), getRegionDisplayNames()

### Community 58 - "Community 58"
Cohesion: 0.4
Nodes (2): createLanguageSupport(), loadLanguageSupport()

### Community 59 - "Community 59"
Cohesion: 0.7
Nodes (4): buildRepoInfoReferenceModel(), createSidebarEntryFromRefName(), formatStashLabel(), normalizeCommitRefLabel()

### Community 60 - "Community 60"
Cohesion: 0.7
Nodes (4): buildRepoInfoTimelineRows(), formatStashLabel(), normalizeCommitRefLabel(), resolveTagNameFromCommitRef()

### Community 62 - "Community 62"
Cohesion: 0.6
Nodes (3): formatMegabytes(), resolveDiffPreviewUiState(), resolveGuardCopy()

### Community 67 - "Community 67"
Cohesion: 0.5
Nodes (2): GlobalGitAuthDialog(), useGitAuthPrompts()

### Community 70 - "Community 70"
Cohesion: 0.83
Nodes (3): isDiffWorkspaceTextEncodingUnsupported(), resolveDiffWorkspaceEncodingValue(), resolveDiffWorkspaceRequestedEncoding()

### Community 71 - "Community 71"
Cohesion: 0.67
Nodes (2): toDateLabel(), toRelativeDateLabel()

### Community 72 - "Community 72"
Cohesion: 0.83
Nodes (3): isBlockBoundary(), parseFenceInfo(), parseMarkdownBlocks()

### Community 73 - "Community 73"
Cohesion: 0.83
Nodes (3): loadGitignoreTemplates(), loadLicenseTemplates(), loadRepositoryTemplates()

### Community 75 - "Community 75"
Cohesion: 1.0
Nodes (2): main(), runCommand()

### Community 76 - "Community 76"
Cohesion: 1.0
Nodes (2): appendEntry(), createEntryId()

### Community 80 - "Community 80"
Cohesion: 1.0
Nodes (2): createEditorChromeTheme(), createThemeExtension()

### Community 81 - "Community 81"
Cohesion: 1.0
Nodes (2): resolveEdgePath(), resolveLaneX()

### Community 86 - "Community 86"
Cohesion: 1.0
Nodes (2): groupCommands(), searchHeaderTabsPalette()

### Community 90 - "Community 90"
Cohesion: 0.67
Nodes (3): Desktop Database Hooks, Icon Cache Hooks, litgit-desktop-bin.install

### Community 113 - "Community 113"
Cohesion: 1.0
Nodes (1): String

### Community 114 - "Community 114"
Cohesion: 1.0
Nodes (1): String

### Community 115 - "Community 115"
Cohesion: 1.0
Nodes (1): String

### Community 116 - "Community 116"
Cohesion: 1.0
Nodes (1): String

### Community 144 - "Community 144"
Cohesion: 1.0
Nodes (2): Desktop Development Commands, Vite Desktop Preview

### Community 194 - "Community 194"
Cohesion: 1.0
Nodes (1): GitHub Provider Icon

### Community 195 - "Community 195"
Cohesion: 1.0
Nodes (1): GitLab Provider Icon

### Community 196 - "Community 196"
Cohesion: 1.0
Nodes (1): Bitbucket Provider Icon

### Community 197 - "Community 197"
Cohesion: 1.0
Nodes (1): Default Provider Icon

## Knowledge Gaps
- **177 isolated node(s):** `RepositoryError`, `String`, `PickedRepository`, `PickedFilePath`, `CloneRepositoryProgress` (+172 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 53`** (6 nodes): `diff-workspace-blame-surface.tsx`, `DiffWorkspaceBlameSurface()`, `resolveAuthorColor()`, `resolveAvatarLabel()`, `toDateLabel()`, `toRelativeDateLabel()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 58`** (5 nodes): `language-support.ts`, `language-resolver.ts`, `createLanguageSupport()`, `loadLanguageSupport()`, `resolveLanguage()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 67`** (4 nodes): `global-git-auth-dialog.tsx`, `use-git-auth-prompts.ts`, `GlobalGitAuthDialog()`, `useGitAuthPrompts()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 71`** (4 nodes): `diff-workspace-history-surface.tsx`, `resolveAvatarLabel()`, `toDateLabel()`, `toRelativeDateLabel()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 75`** (3 nodes): `main()`, `cleanup.mjs`, `runCommand()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 76`** (3 nodes): `use-operation-log-store.ts`, `appendEntry()`, `createEntryId()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 80`** (3 nodes): `theme-extension.ts`, `createEditorChromeTheme()`, `createThemeExtension()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 81`** (3 nodes): `git-graph-overlay.tsx`, `resolveEdgePath()`, `resolveLaneX()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 86`** (3 nodes): `header-tabs-search-search.ts`, `groupCommands()`, `searchHeaderTabsPalette()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 113`** (2 nodes): `String`, `.from()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 114`** (2 nodes): `String`, `.from()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 115`** (2 nodes): `String`, `.from()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 116`** (2 nodes): `String`, `.from()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 144`** (2 nodes): `Desktop Development Commands`, `Vite Desktop Preview`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 194`** (1 nodes): `GitHub Provider Icon`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 195`** (1 nodes): `GitLab Provider Icon`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 196`** (1 nodes): `Bitbucket Provider Icon`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 197`** (1 nodes): `Default Provider Icon`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `git_command()` connect `Community 6` to `Community 0`, `Community 4`, `Community 7`, `Community 8`, `Community 9`, `Community 10`, `Community 12`, `Community 23`?**
  _High betweenness centrality (0.026) - this node is a cross-community bridge._
- **Why does `load_integrations_config()` connect `Community 2` to `Community 0`, `Community 4`, `Community 5`, `Community 7`, `Community 9`, `Community 10`?**
  _High betweenness centrality (0.015) - this node is a cross-community bridge._
- **Why does `delete_remote_repository_branch_inner()` connect `Community 6` to `Community 0`, `Community 9`, `Community 7`?**
  _High betweenness centrality (0.013) - this node is a cross-community bridge._
- **Are the 26 inferred relationships involving `getTauriInvoke()` (e.g. with `getSettingsBackendCapabilities()` and `listStoredHttpCredentialEntries()`) actually correct?**
  _`getTauriInvoke()` has 26 INFERRED edges - model-reasoned connections that need verification._
- **Are the 37 inferred relationships involving `validate_git_repo()` (e.g. with `get_repository_history_inner()` and `get_latest_repository_commit_message_inner()`) actually correct?**
  _`validate_git_repo()` has 37 INFERRED edges - model-reasoned connections that need verification._
- **Are the 34 inferred relationships involving `git_command()` (e.g. with `run_clone_command()` and `git_output()`) actually correct?**
  _`git_command()` has 34 INFERRED edges - model-reasoned connections that need verification._
- **Are the 22 inferred relationships involving `git_error_message()` (e.g. with `clone_git_repository()` and `initialize_git_repository()`) actually correct?**
  _`git_error_message()` has 22 INFERRED edges - model-reasoned connections that need verification._