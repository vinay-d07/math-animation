import { SignUp } from "@clerk/nextjs";
import { IconFilm } from "../../../components/icons";

export default function SignUpPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-4">
      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-indigo-500/20 text-indigo-400">
          <IconFilm className="h-4 w-4" />
        </div>
        <span className="text-sm font-semibold tracking-tight text-neutral-200">Manim Studio</span>
      </div>
      <SignUp />
    </main>
  );
}
