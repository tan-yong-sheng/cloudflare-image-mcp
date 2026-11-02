import { useState } from "react";
import { useModels } from "../../api/models";
import type { AdminProvider, ModelConfig } from "../../api/types";

interface ModelFilterCardProps {
  /**
   * The provider families on screen, used to name the families behind a
   * duplicated model. The registry keys models by unique id and each
   * entry names one transport, so a family is resolved by matching its
   * transport against the entry's inferenceProvider (ADR-002).
   */
  providers: AdminProvider[];
  /**
   * The models that passed the last live-test run (Card 2's data, fed
   * through the rail's filters slot by a later ticket). Absent or empty
   * means no run has happened yet, so the Working chip stays in its
   * greyed, disabled pre-run state; a non-empty set lights the chip and
   * pressing it narrows the list to those models.
   */
  workingModels?: Set<string>;
}

/** A model name normalized for duplicate detection: same text, any case. */
function normalizeName(model: ModelConfig): string {
  return (model.name ?? model.id).trim().toLowerCase();
}

/** The family serving a model, by transport; the transport id is the fallback. */
function familyDisplayName(
  model: ModelConfig,
  providers: AdminProvider[]
): string {
  return (
    providers.find((provider) => provider.transport === model.inferenceProvider)
      ?.displayName ?? model.inferenceProvider
  );
}

interface DuplicateGroup {
  name: string;
  families: string[];
}

/**
 * Model names served by more than one provider family.
 *
 * The registry has one entry per unique id with one transport each, so
 * "the same model from several families" can only mean equal display
 * names across entries whose transports differ. A group within a single
 * transport is not cross-provider and stays unmarked.
 */
function duplicateGroups(
  models: ModelConfig[],
  providers: AdminProvider[]
): DuplicateGroup[] {
  const groups = new Map<string, ModelConfig[]>();
  for (const model of models) {
    const key = normalizeName(model);
    const group = groups.get(key);
    if (group) {
      group.push(model);
    } else {
      groups.set(key, [model]);
    }
  }
  const duplicates: DuplicateGroup[] = [];
  for (const group of groups.values()) {
    const transports = new Set(group.map((model) => model.inferenceProvider));
    if (transports.size < 2) continue;
    duplicates.push({
      name: group[0].name ?? group[0].id,
      families: [
        ...new Set(group.map((model) => familyDisplayName(model, providers))),
      ],
    });
  }
  return duplicates;
}

const IMAGE_EDIT_TASK = "image-to-image";

/**
 * Card 1 of the operations rail: quick filter chips over the model
 * registry, a shown/total count, and cross-provider duplicate hints.
 *
 * The chips are independent AND-composable toggles; a model stays
 * visible only while it matches every pressed chip. A registry entry
 * without a costClass reads as paid, never as free.
 */
export function ModelFilterCard({
  providers,
  workingModels,
}: ModelFilterCardProps) {
  const registry = useModels();
  const [freeOnly, setFreeOnly] = useState(false);
  const [imageEditOnly, setImageEditOnly] = useState(false);
  const [workingOnly, setWorkingOnly] = useState(false);

  const models = registry.data ?? [];
  // The Working chip only participates once a run has produced results;
  // with no data it is pressed nowhere and filters nothing.
  const hasWorkingData = workingModels !== undefined && workingModels.size > 0;
  const workingActive = workingOnly && hasWorkingData;

  const visible = models.filter((model) => {
    if (freeOnly && model.costClass !== "free") return false;
    if (imageEditOnly && !(model.taskTypes ?? []).includes(IMAGE_EDIT_TASK)) {
      return false;
    }
    if (workingActive && !(workingModels?.has(model.id) ?? false)) {
      return false;
    }
    return true;
  });
  const duplicates = duplicateGroups(models, providers);

  const chipClass = (active: boolean) =>
    `chip ${active ? "text-white" : "text-muted"} disabled:opacity-45`;
  const chipStyle = (active: boolean) =>
    active
      ? { backgroundColor: "var(--primary)", borderColor: "var(--primary)" }
      : undefined;

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          id="adminOpsChipFree"
          className={chipClass(freeOnly)}
          style={chipStyle(freeOnly)}
          aria-pressed={freeOnly}
          title="Models priced at $0"
          onClick={() => setFreeOnly((on) => !on)}
        >
          Free
        </button>
        <button
          type="button"
          id="adminOpsChipImageEdit"
          className={chipClass(imageEditOnly)}
          style={chipStyle(imageEditOnly)}
          aria-pressed={imageEditOnly}
          title="Models that accept image input"
          onClick={() => setImageEditOnly((on) => !on)}
        >
          Image-edit
        </button>
        <button
          type="button"
          id="adminOpsChipWorking"
          className={chipClass(workingActive)}
          style={chipStyle(workingActive)}
          aria-pressed={workingActive}
          disabled={!hasWorkingData}
          title="Models that passed the last live test"
          onClick={() => setWorkingOnly((on) => !on)}
        >
          Working
        </button>
      </div>
      {registry.isPending ? (
        <p className="text-xs text-muted mt-3">Loading models…</p>
      ) : registry.isError ? (
        <p className="text-xs text-muted mt-3">Could not load models.</p>
      ) : (
        <>
          <p id="adminOpsModelCount" className="text-xs text-muted mt-3">
            {visible.length} of {models.length}{" "}
            {models.length === 1 ? "model" : "models"}
          </p>
          <ul id="adminOpsModelList" className="mt-2 space-y-1">
            {visible.map((model) => (
              <li key={model.id} className="text-sm">
                {model.name ?? model.id}
              </li>
            ))}
          </ul>
          {duplicates.length > 0 ? (
            <div id="adminOpsDuplicates" className="mt-3 space-y-1">
              {duplicates.map((group) => (
                <p key={group.name} className="text-xs text-muted">
                  {group.name} is also served by {group.families.join(", ")}
                </p>
              ))}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
