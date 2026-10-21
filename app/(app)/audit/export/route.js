import { redirect } from "next/navigation";

/** The old export URL, kept working. See `../page.jsx` for why. */
export async function GET(request) {
  const { search } = new URL(request.url);
  redirect(`/portal-log/export${search}`);
}
