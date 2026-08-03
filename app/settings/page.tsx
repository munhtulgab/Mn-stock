import { getDb } from "@/lib/mongodb";
import { getSettings, maskSettings } from "@/lib/settings";
import { isSettingsPageAuthorized } from "@/lib/settingsAuth";
import SettingsLogin from "@/components/SettingsLogin";
import SettingsForm from "@/components/SettingsForm";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const authorized = await isSettingsPageAuthorized();
  if (!authorized) {
    return <SettingsLogin />;
  }

  const db = await getDb();
  const settings = await getSettings(db);
  const masked = maskSettings(settings);

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="text-xl font-semibold mb-6">Тохиргоо</h1>
      <SettingsForm initial={masked} />
    </div>
  );
}
