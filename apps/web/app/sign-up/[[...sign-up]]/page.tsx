import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <main className="flex min-h-[calc(100vh-53px)] flex-col items-center justify-center gap-6 px-4">
      <SignUp />
    </main>
  );
}
