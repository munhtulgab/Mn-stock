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
    <div className="px-4 pt-6 pb-4">
      <h1 className="text-xl font-bold text-app-text mb-4">Тохиргоо</h1>
      <SettingsForm initial={masked} />
    </div>
  );
}
