import { unstable_cache } from "next/cache";
import { getCatalystCalendar } from "@biocatalyst/data";
import { CalendarView } from "@/components/CalendarView";

export const dynamic = "force-dynamic";
export const metadata = { title: "Catalyst calendar — Biocatalyst India" };

const getCachedAgenda = unstable_cache(
  () => getCatalystCalendar({ limit: 250 }),
  ["unified-catalyst-calendar"],
  { revalidate: 300 },
);

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; date?: string }>;
}) {
  const [items, sp] = await Promise.all([getCachedAgenda(), searchParams]);
  return <CalendarView initialItems={items} initialView={sp.view} initialDate={sp.date} />;
}
