import { GitAuthDialog } from "@/components/auth/git-auth-dialog";
import { useGitAuthPrompts } from "@/hooks/use-git-auth-prompts";

export function GlobalGitAuthDialog() {
  const { prompt, submit } = useGitAuthPrompts();

  if (!prompt) {
    return null;
  }

  return (
    <GitAuthDialog
      onCancel={async () => {
        await submit({
          sessionId: prompt.sessionId,
          promptId: prompt.promptId,
          cancelled: true,
          remember: false,
        });
      }}
      onContinue={async () => {
        await submit({
          sessionId: prompt.sessionId,
          promptId: prompt.promptId,
          cancelled: false,
          remember: false,
        });
      }}
      open={prompt !== null}
      prompt={prompt}
    />
  );
}
