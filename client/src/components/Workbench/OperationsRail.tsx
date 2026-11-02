import type { ReactNode } from "react";

interface OperationsCardProps {
  /** Stable anchor for the e2e and component suites. */
  id: string;
  /** The card's heading. */
  title: string;
  /** The line a card shows while its real content has not landed. */
  placeholder: string;
  /** The card's body; when absent the greyed placeholder renders. */
  children?: ReactNode;
}

/**
 * A card shell in the operations rail.
 *
 * Exported so later tickets can fill a card by passing body content
 * through the rail's slot props without re-plumbing the layout: a card
 * whose slot is empty renders its greyed placeholder body instead.
 */
export function OperationsCard({
  id,
  title,
  placeholder,
  children,
}: OperationsCardProps) {
  return (
    <section id={id} className="card p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted mb-3">
        {title}
      </h3>
      {children ?? (
        <p className="text-xs text-muted opacity-45">{placeholder}</p>
      )}
    </section>
  );
}

export interface OperationsRailProps {
  /**
   * Whether the top-bar Operations toggle has opened the rail. Below the
   * md breakpoint the rail stays hidden until the toggle opens it; at md
   * and above it is always visible. Visibility is CSS-driven, so the
   * rail stays in the DOM either way.
   */
  open: boolean;
  /** Card 1 body — model filters. */
  filters?: ReactNode;
  /** Card 2 body — live test. */
  test?: ReactNode;
  /** Card 3 body — liveness history. */
  history?: ReactNode;
}

/**
 * The right-hand operations rail: the third column of the workbench.
 *
 * The cards ship as greyed placeholders; the model-filters and live-test
 * tickets fill their slots through this component's props, in this card
 * order. The rail sits below the key drawer in stacking order — it adds
 * no z-index of its own.
 */
export function OperationsRail({
  open,
  filters,
  test,
  history,
}: OperationsRailProps) {
  return (
    <aside
      id="adminOpsRail"
      aria-label="Operations"
      className={`${
        open ? "flex" : "hidden"
      } md:flex flex-col gap-4 md:w-72 xl:w-80 flex-shrink-0`}
    >
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
        Operations
      </h2>
      <OperationsCard
        id="adminOpsCardFilters"
        title="Model filters"
        placeholder="Fills in when model filters land."
      >
        {filters}
      </OperationsCard>
      <OperationsCard
        id="adminOpsCardTest"
        title="Live test"
        placeholder="Fills in when the live-test endpoint lands."
      >
        {test}
      </OperationsCard>
      <OperationsCard
        id="adminOpsCardHistory"
        title="Liveness history"
        placeholder="Backfills once the test endpoint lands."
      >
        {history}
      </OperationsCard>
    </aside>
  );
}
