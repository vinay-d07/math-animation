import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <main className="flex min-h-[calc(100vh-53px)] flex-col items-center justify-center gap-6 px-4">
      <SignIn />
    </main>
  );
}
