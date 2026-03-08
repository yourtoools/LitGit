interface ImportMetaEnv {
  readonly VITE_BUG_REPORT_URL: string;
  readonly VITE_RELEASE_NOTES_URL: string;
  readonly VITE_SOURCE_CODE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
