import { MonitorManager } from "@/components/MonitorManager";

export default function MonitorsPage() {
  return (
    <>
      <div className="page-head">
        <h1>Smart monitors</h1>
        <p>Personal keyword, market and catalyst alerts across the BioCatalyst feed.</p>
      </div>
      <MonitorManager />
    </>
  );
}
