import { useState } from "react";

/**
 * A slot the batch asked for and did not deliver.
 *
 * `failed` is the one slot the provider refused; `notAttempted` is every
 * slot after it, which the Worker never sent because it stops the batch on
 * the first failure. They are labelled differently, because "failed" and
 * "never tried" are not the same apology. The reason lives in the panel's
 * alert line, next to the slots rather than repeated in each one.
 */
export type MissingSlot = { kind: "failed" } | { kind: "notAttempted" };

interface ResultPanelProps {
  /** Changes on every generation, so the image remounts and fires load. */
  generationId?: number;
  /** The images of the current response, in order. */
  images: string[];
  /** The slots of the same response that produced no image, in order. */
  missing: MissingSlot[];
  activeIndex: number;
  onSelect: (index: number) => void;
  loading: boolean;
  /** Whether the empty-state hint is shown. */
  showInitial: boolean;
  error: string | null;
  usedModel: string;
  generationTime: string;
  canDownload: boolean;
  onImageLoad: () => void;
  onImageError: () => void;
  /** Replays the batch that produced the missing slots. */
  onRetry?: () => void;
}

/**
 * The result panel.
 *
 * The images of one generation are shown as a gallery: the selected one
 * large, the rest as thumbnails. A batch that fell short also lists what it
 * did not deliver and says how many of the requested images it produced, so
 * a short answer is never mistaken for a complete one. A failed load leaves
 * the previous result in place rather than replacing it with a broken image.
 */
export function ResultPanel({
  generationId,
  images,
  missing,
  activeIndex,
  onSelect,
  loading,
  showInitial,
  error,
  usedModel,
  generationTime,
  canDownload,
  onImageLoad,
  onImageError,
  onRetry,
}: ResultPanelProps) {
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const current = images[activeIndex] ?? "";
  // A batch that produced nothing has no image to show, so the frame would
  // be an empty square above the placeholders that explain it.
  const showFrame = images.length > 0 || showInitial || loading;

  const download = async () => {
    if (!current) return;
    try {
      const response = await fetch(current);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "image-" + Date.now() + ".png";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      setDownloadError(null);
    } catch (cause) {
      setDownloadError(
        "Download failed: " +
          (cause instanceof Error ? cause.message : String(cause))
      );
    }
  };

  return (
    <div className="card h-full p-4 space-y-4 fade-in">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold flex items-center">
          <i className="fa-solid fa-image mr-2 text-primary" />
          Result
        </h2>
        <div className="flex space-x-2">
          <button
            id="downloadButton"
            type="button"
            className={`btn btn-secondary text-sm py-1 px-3${
              canDownload ? "" : " hidden"
            }`}
            onClick={download}
          >
            <i className="fa-solid fa-download mr-1" />
            Download
          </button>
        </div>
      </div>

      {showFrame ? (
        <div className="image-container card">
          <div
            id="loadingOverlay"
            className={`loading-mask${loading ? "" : " hidden"}`}
            role="status"
            aria-label="Generating image"
          >
            <div className="text-center">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white" />
              <p className="text-white mt-3 font-medium">Generating...</p>
            </div>
          </div>
          <div
            id="initialPrompt"
            className={`text-center text-gray-400 dark:text-gray-600${
              showInitial ? "" : " hidden"
            }`}
          >
            <i className="fa-solid fa-image-portrait text-4xl mb-2" />
            <p>Click generate to create an image</p>
          </div>
          <img
            key={generationId}
            id="aiImage"
            className={`max-h-full max-w-full rounded${current ? "" : " hidden"}`}
            alt="Generated image"
            src={current || undefined}
            onLoad={onImageLoad}
            onError={onImageError}
          />
        </div>
      ) : null}

      {images.length > 1 ? (
        <div
          id="imageGallery"
          className="flex flex-wrap gap-2"
          role="group"
          aria-label="Generated images"
        >
          {images.map((image, index) => (
            <button
              key={image + index}
              type="button"
              className={`w-16 h-16 rounded overflow-hidden border-2 ${
                index === activeIndex
                  ? "border-primary"
                  : "border-transparent opacity-70 hover:opacity-100"
              }`}
              aria-label={`Show image ${index + 1}`}
              aria-current={index === activeIndex}
              onClick={() => onSelect(index)}
            >
              <img src={image} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      ) : null}

      {missing.length > 0 ? (
        <div id="missingSlots" className="space-y-2">
          <p id="resultCount" className="text-sm text-gray-400">
            {images.length} of {images.length + missing.length} images
            generated.
          </p>
          <div className="space-y-2">
            {missing.map((slot, index) =>
              slot.kind === "failed" ? (
                <p
                  key={"failed-" + index}
                  className="text-sm text-red-500 border border-red-500/40 rounded p-2"
                >
                  <i
                    className="fa-solid fa-triangle-exclamation mr-2"
                    aria-hidden="true"
                  />
                  Failed
                </p>
              ) : (
                <p
                  key={"missed-" + index}
                  className="text-sm text-gray-400 border border-dashed rounded p-2"
                >
                  <i className="fa-solid fa-ban mr-2" aria-hidden="true" />
                  Not attempted
                </p>
              )
            )}
          </div>
          {onRetry ? (
            <button
              id="retryButton"
              type="button"
              className="btn btn-secondary text-sm py-1 px-3"
              onClick={onRetry}
            >
              <i className="fa-solid fa-rotate-right mr-1" aria-hidden="true" />
              Retry batch
            </button>
          ) : null}
        </div>
      ) : null}

      <p
        id="generateError"
        className={`text-sm text-red-500${
          error || downloadError ? "" : " hidden"
        }`}
        role="alert"
      >
        {error ?? downloadError}
      </p>

      <div id="imageInfo" className="space-y-3 mt-2">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <span className="font-medium">Model:</span>{" "}
            <span id="usedModel">{usedModel}</span>
          </div>
          <div>
            <span className="font-medium">Time:</span>{" "}
            <span id="generationTime">{generationTime}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
