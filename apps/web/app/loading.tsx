import { IconLoader } from "../components/icons";

export default function GlobalLoading() {
  return (
    <main className="flex min-h-[60vh] items-center justify-center">
      <IconLoader className="h-5 w-5 text-smoke" />
    </main>
  );
}
