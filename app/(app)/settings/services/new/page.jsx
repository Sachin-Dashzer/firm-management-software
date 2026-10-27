import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { can } from "@/lib/permissions";
import ServiceForm from "../ServiceForm";

export const metadata = { title: "Add a service · PHMG" };

export default async function NewServicePage() {
  const actor = await requireUser();
  if (!can(actor, "edit", "serviceCatalog")) redirect("/settings/services");

  return (
    <div className="mx-auto flex max-w-[900px] flex-col gap-6 p-4 md:p-6">
      <div>
        <Link
          href="/settings/services"
          className="text-13 text-ink-muted underline underline-offset-4"
        >
          Services
        </Link>
        <h1 className="font-display text-24 font-bold tracking-tight">
          Add a service
        </h1>
      </div>
      <ServiceForm />
    </div>
  );
}
