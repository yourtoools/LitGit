import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: HomeComponent,
});

function HomeComponent() {
  return (
    <section className="h-full min-h-0">
      <div className="flex h-full w-full flex-col items-center justify-center">
        <h1 className="font-bold text-2xl">Welcome to LitGit Desktop!</h1>
        <p className="mt-4 text-lg">
          Fast, fluent, and minimal Git client for everyone.
        </p>
      </div>
    </section>
  );
}
