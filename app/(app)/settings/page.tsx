import { getDb } from "@/lib/mongodb";
import { getSettings, maskSettings } from "@/lib/settings";
import SettingsForm from "@/components/SettingsForm";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  // No separate password gate: the `(app)` layout already redirects anyone
  // without a session to /login before this page can render.
  const db = await getDb();
  const settings = await getSettings(db);
  const masked = maskSettings(settings);

  return (
    <div className="px-4 pt-6 pb-4">
      <h1 className="text-xl font-bold text-app-text mb-4">Тохиргоо</h1>
      <SettingsForm initial={masked} />
    </div>
  );
}
