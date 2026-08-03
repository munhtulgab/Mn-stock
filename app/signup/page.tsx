import { redirect } from "next/navigation";
import { getDb } from "@/lib/mongodb";
import { getCurrentUser } from "@/lib/auth";
import { SignupForm } from "@/components/AuthForm";

export const dynamic = "force-dynamic";

export default async function SignupPage() {
  const db = await getDb();
  const user = await getCurrentUser(db);
  if (user) redirect("/");
  return <SignupForm />;
}
