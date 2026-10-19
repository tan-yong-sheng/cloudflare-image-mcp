import { useState } from "react";

interface ResultPanelProps {
  /** The images of the current response, in order. */
  images: string[];
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
}

/**
 * The result panel.
 *
 * The images of one generation are shown as a gallery: the selected one
 * large, the rest as thumbnails. A failed load leaves the previous
 * result in place rather than replacing it with a broken image.
 */
export function ResultPanel({
  images,
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
}: ResultPanelProps) {
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const current = images[activeIndex] ?? "";

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
          id="aiImage"
          className={`max-h-full max-w-full rounded${current ? "" : " hidden"}`}
          alt="Generated image"
          src={current || undefined}
          onLoad={onImageLoad}
          onError={onImageError}
        />
      </div>

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
