import { Suspense } from "react";
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

export default async function CalendarPage() {
  const items = await getCachedAgenda();
  return (
    <Suspense>
      <CalendarView initialItems={items} />
    </Suspense>
  );
}
