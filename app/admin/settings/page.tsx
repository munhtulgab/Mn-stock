import { getDb } from "@/lib/mongodb";
import { requireAdminPage } from "@/lib/roles";
import { getSettings, maskSettings } from "@/lib/settings";
import SettingsForm from "@/components/SettingsForm";
import PageHead from "@/components/admin/PageHead";

export const dynamic = "force-dynamic";

/**
 * The installation's settings, which is what they always were.
 *
 * They used to live at `/settings` behind nothing more than being signed in,
 * which was right while every account belonged to the operator. API keys, the
 * Facebook cookie, the SMS sender and the push switch are the installation's,
 * not any reader's — so they are here, and the route handlers behind the form
 * check for the same role rather than trusting that this page is the only way
 * anyone reaches them.
 */
export default async function AdminSettingsPage() {
  const db = await getDb();
  await requireAdminPage(db);
  const masked = maskSettings(await getSettings(db));

  return (
    <div className="space-y-5">
      <PageHead
        title="Системийн тохиргоо"
        sub="AI үйлчилгээ, мэдээллийн эх сурвалж, мэдэгдэл болон SMS"
      />
      <SettingsForm initial={masked} />
    </div>
  );
}
