import Link from "next/link";
import { unstable_cache } from "next/cache";
import { listDrugs } from "@biocatalyst/data";
import { THERAPEUTIC_AREAS, MODALITY_GROUPS } from "@/lib/explore-taxonomy";

export const dynamic = "force-dynamic";

const getCachedDrugs = unstable_cache(listDrugs, ["explore-drugs"], { revalidate: 600 });

export default async function ExplorePage() {
  // Drug counts per section so the cards feel alive.
  const allDrugs = await getCachedDrugs();
  const areaCounts = THERAPEUTIC_AREAS.map((area) =>
    allDrugs.filter((drug) => drug.indications.some((item) => area.indications.includes(item))).length,
  );
  const modalityCounts = MODALITY_GROUPS.map(
    (g) => allDrugs.filter((d) => d.modality && g.modalities.includes(d.modality)).length,
  );

  return (
    <>
      <div className="page-head">
        <h1>Explore</h1>
        <p>
          Browse everything by disease area or by drug modality — no search
          query needed.
        </p>
      </div>

      <section aria-label="Disease areas">
        <h2>Disease areas</h2>
        <div className="card-grid">
          {THERAPEUTIC_AREAS.map((a, i) => (
            <Link key={a.id} className="card card-link" href={`/explore/area/${a.id}`}>
              <h3>{a.label}</h3>
              <p className="muted">{a.blurb}</p>
              <p className="count">
                {areaCounts[i]} drug{areaCounts[i] === 1 ? "" : "s"}
              </p>
            </Link>
          ))}
        </div>
      </section>

      <section aria-label="Modalities" style={{ marginTop: 32, paddingBottom: 48 }}>
        <h2>Modalities</h2>
        <div className="card-grid">
          {MODALITY_GROUPS.map((g, i) => (
            <Link key={g.id} className="card card-link" href={`/explore/modality/${g.id}`}>
              <h3>{g.label}</h3>
              <p className="muted">{g.blurb}</p>
              <p className="count">
                {modalityCounts[i]} drug{modalityCounts[i] === 1 ? "" : "s"}
              </p>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
