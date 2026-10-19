import type { ModelControls } from "./model-controls";

interface AdvancedOptionsProps {
  open: boolean;
  onToggle: () => void;
  controls: ModelControls;
  onSizeChange: (size: string) => void;
  onStepsChange: (steps: number) => void;
  onGuidanceChange: (guidance: number) => void;
  seed: string;
  onSeedChange: (seed: string) => void;
  count: number;
  onCountChange: (count: number) => void;
}

/**
 * The advanced options.
 *
 * Every control here is conditional on what the selected model declares:
 * a model that drops a parameter must not show a control for it, or the
 * operator would believe a setting took effect when it did not.
 */
export function AdvancedOptions({
  open,
  onToggle,
  controls,
  onSizeChange,
  onStepsChange,
  onGuidanceChange,
  seed,
  onSeedChange,
  count,
  onCountChange,
}: AdvancedOptionsProps) {
  return (
    <div className="card p-4 space-y-4 fade-in">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold flex items-center">
          <i className="fa-solid fa-gear mr-2 text-primary" />
          Advanced Options
        </h2>
        <button
          id="toggleAdvanced"
          type="button"
          className="text-xs btn btn-secondary py-1 px-3"
          aria-expanded={open}
          aria-controls="advancedOptions"
          onClick={onToggle}
        >
          <i
            className={`fa-solid ${open ? "fa-chevron-up" : "fa-chevron-down"} mr-1`}
            id="advancedIcon"
          />
          Show/Hide
        </button>
      </div>

      <div id="advancedOptions" className={`space-y-3${open ? "" : " hidden"}`}>
        {controls.showSize ? (
          <div id="sizeWrap">
            <label htmlFor="size" className="block text-sm font-medium mb-1">
              <i className="fa-solid fa-expand mr-1" />
              Size
            </label>
            <select
              id="size"
              className="w-full"
              value={controls.size}
              onChange={(event) => onSizeChange(event.target.value)}
            >
              {controls.sizes.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {controls.showSteps ? (
          <div id="stepsWrap">
            <div className="flex justify-between items-center">
              <label htmlFor="steps" className="block text-sm font-medium">
                Steps
              </label>
              <span id="stepsValue" className="text-sm font-mono">
                {controls.steps.value}
              </span>
            </div>
            <input
              type="range"
              id="steps"
              min={controls.steps.min}
              max={controls.steps.max}
              step={controls.steps.step}
              value={controls.steps.value}
              className="slider w-full"
              onChange={(event) =>
                onStepsChange(Number.parseInt(event.target.value, 10))
              }
            />
          </div>
        ) : null}

        {controls.showGuidance ? (
          <div id="guidanceWrap">
            <div className="flex justify-between items-center">
              <label htmlFor="guidance" className="block text-sm font-medium">
                Guidance
              </label>
              <span id="guidanceValue" className="text-sm font-mono">
                {controls.guidance.value}
              </span>
            </div>
            <input
              type="range"
              id="guidance"
              min={controls.guidance.min}
              max={controls.guidance.max}
              step={controls.guidance.step}
              value={controls.guidance.value}
              className="slider w-full"
              onChange={(event) =>
                onGuidanceChange(Number.parseFloat(event.target.value))
              }
            />
          </div>
        ) : null}

        <div>
          <label htmlFor="seed" className="block text-sm font-medium mb-1">
            Seed (leave empty for random)
          </label>
          <div className="flex gap-2">
            <input
              type="number"
              id="seed"
              placeholder="Random seed"
              className="w-full"
              value={seed}
              onChange={(event) => onSeedChange(event.target.value)}
            />
            <button
              id="randomSeed"
              type="button"
              className="btn btn-secondary text-sm py-1 px-3"
              aria-label="Randomize seed"
              onClick={() =>
                onSeedChange(String(Math.floor(Math.random() * 4294967295)))
              }
            >
              <i className="fa-solid fa-random" />
            </button>
          </div>
        </div>

        <div>
          <label htmlFor="n" className="block text-sm font-medium mb-1">
            Number of images
          </label>
          <select
            id="n"
            className="w-full"
            value={count}
            onChange={(event) =>
              onCountChange(Number.parseInt(event.target.value, 10))
            }
          >
            {[1, 2, 3, 4, 5, 6, 7, 8].map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
