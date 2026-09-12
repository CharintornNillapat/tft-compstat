import { EmptyState } from "@/components/empty-state";
import { MeDashboard } from "@/components/me-dashboard";
import { getDashboardData } from "@/lib/stats/queries";

/**
 * The stats half of `/me`. Fetches once — up to 50 rows plus the name book they
 * reference — and hands plain props to the client, which does every filter change
 * in the browser without another round trip.
 */
export async function Dashboard() {
  const data = await getDashboardData();

  if (!data) {
    return (
      <EmptyState title="No account tracked">
        Run <code className="text-zinc-300">pnpm riot:setup</code> to link a Riot ID.
      </EmptyState>
    );
  }

  if (data.rows.length === 0) {
    return (
      <EmptyState title="No matches cached yet">
        The first sync pulls in your last 20 games. Use Refresh above, or wait for the daily cron.
      </EmptyState>
    );
  }

  return (
    <MeDashboard rows={data.rows} names={data.names} currentSet={data.currentSet} setName={data.setName} />
  );
}
