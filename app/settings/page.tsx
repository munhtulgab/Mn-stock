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
    <div className="mx-auto max-w-2xl px-3 py-4">
      <h1 className="text-base font-bold uppercase tracking-wider text-term-amber mb-4 border-b border-term-border pb-2">
        System Configuration
      </h1>
      <SettingsForm initial={masked} />
    </div>
  );
}
