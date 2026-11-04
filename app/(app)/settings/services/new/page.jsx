import { redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { can } from "@/lib/permissions";
import ServiceForm from "../ServiceForm";
import SettingsScreen from "../../Shell";

export const metadata = { title: "New service · PHMG" };

/**
 * A new kind of work the firm takes on.
 *
 * The page is thin on purpose — `ServiceForm` is shared with the edit
 * screen, so anything written here would be a second place to keep the
 * same explanation. What belongs here is the one thing that is only true
 * of a *new* service: nothing exists yet, and saving it changes what the
 * team can create jobs from.
 */
export default async function NewServicePage() {
  const actor = await requireUser();
  if (!can(actor, "edit", "serviceCatalog")) redirect("/settings/services");

  return (
    <SettingsScreen
      title="New service"
      sub="Define it once and every job of this kind starts from it — the steps, what each step needs, who may do the work and who signs it off."
      back={{ href: "/settings/services", label: "Services" }}
    >
      <ServiceForm />
    </SettingsScreen>
  );
}
