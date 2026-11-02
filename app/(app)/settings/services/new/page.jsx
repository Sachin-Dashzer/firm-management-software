import { redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { can } from "@/lib/permissions";
import ServiceForm from "../ServiceForm";
import SettingsScreen from "../../Shell";

export const metadata = { title: "Add a service · PHMG" };

export default async function NewServicePage() {
  const actor = await requireUser();
  if (!can(actor, "edit", "serviceCatalog")) redirect("/settings/services");

  return (
    <SettingsScreen
      title="Add a service"
      sub="A new kind of work the firm takes on, with the checklist and the steps every job of it will start from."
      back={{ href: "/settings/services", label: "Services" }}
    >
      <ServiceForm />
    </SettingsScreen>
  );
}
