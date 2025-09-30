export interface DurationParserResult {
  milliseconds: number;
  unit: string;
  value: number;
}

export function parseDurationString(duration: string): DurationParserResult {
  if (!duration || typeof duration !== 'string') {
    throw new Error('Duration string is required');
  }

  // Regular expression to match duration format: number followed by unit
  const durationRegex = /^(\d+)(s|min|h|d|w|mon|y)$/;
  const match = duration.match(durationRegex);

  if (!match) {
    throw new Error(
      `Invalid duration format: "${duration}". Expected format: <number><unit> (e.g., 30s, 5min, 2h, 7d, 2w, 6mon, 1y)`
    );
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];

  if (value <= 0) {
    throw new Error(`Duration value must be positive: "${duration}"`);
  }

  // Convert to milliseconds based on unit
  let milliseconds: number;
  switch (unit) {
    case 's':
      milliseconds = value * 1000;
      break;
    case 'min':
      milliseconds = value * 60 * 1000;
      break;
    case 'h':
      milliseconds = value * 60 * 60 * 1000;
      break;
    case 'd':
      milliseconds = value * 24 * 60 * 60 * 1000;
      break;
    case 'w':
      milliseconds = value * 7 * 24 * 60 * 60 * 1000;
      break;
    case 'mon':
      milliseconds = value * 30 * 24 * 60 * 60 * 1000; // Approximate
      break;
    case 'y':
      milliseconds = value * 365 * 24 * 60 * 60 * 1000; // Approximate
      break;
    default:
      throw new Error(`Unsupported duration unit: "${unit}"`);
  }

  return {
    milliseconds,
    unit,
    value,
  };
}

export function formatDurationExamples(): string {
  return [
    '30s - 30 seconds',
    '5min - 5 minutes',
    '2h - 2 hours',
    '7d - 7 days',
    '2w - 2 weeks',
    '6mon - 6 months',
    '1y - 1 year',
  ].join('\n  ');
}