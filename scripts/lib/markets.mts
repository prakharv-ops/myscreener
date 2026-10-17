// Per-country quotas for the global universe (relative weights, scaled to fit the room under --max).
// Country -> target share of the room (relative weights, scaled to fit). Roughly each market's weight among
// global companies above ~$100m, nudged so smaller markets still get representation.
export const QUOTA: Record<string, number> = {
  Japan: 2400, China: 2400, India: 1800, "South Korea": 1100, "Hong Kong": 1000, Taiwan: 1000, "United Kingdom": 900,
  Canada: 800, Australia: 700, Germany: 450, France: 400, Switzerland: 220, Italy: 250, Netherlands: 110,
  Norway: 180, Belgium: 90, Ireland: 40, Portugal: 35, Singapore: 220,
};

