// Country (as Yahoo names it) -> region, for the region filter and FX-normalised comparisons.
const R: Record<string, string[]> = {
  "North America": ["United States", "Canada", "Mexico", "Bermuda", "Puerto Rico"],
  "Latin America": ["Brazil", "Chile", "Argentina", "Colombia", "Peru", "Panama", "Uruguay", "Costa Rica", "Cayman Islands", "British Virgin Islands", "Bahamas", "Barbados"],
  Europe: ["United Kingdom", "Germany", "France", "Netherlands", "Switzerland", "Sweden", "Norway", "Denmark", "Finland", "Spain", "Italy", "Belgium", "Ireland", "Austria", "Portugal", "Poland", "Luxembourg", "Greece", "Czech Republic", "Hungary", "Iceland", "Jersey", "Guernsey", "Isle of Man", "Monaco", "Cyprus", "Malta", "Gibraltar", "Liechtenstein", "Romania", "Estonia", "Lithuania", "Latvia", "Slovenia", "Croatia", "Bulgaria", "Ukraine", "Russia", "Georgia", "Azerbaijan"],
  "Asia-Pacific": ["Japan", "China", "Hong Kong", "Taiwan", "South Korea", "India", "Singapore", "Australia", "New Zealand", "Indonesia", "Malaysia", "Thailand", "Philippines", "Vietnam", "Macau", "Kazakhstan", "Mongolia", "Sri Lanka", "Bangladesh", "Pakistan", "Cambodia", "Papua New Guinea", "Myanmar"],
  "Middle East & Africa": ["Israel", "South Africa", "United Arab Emirates", "Saudi Arabia", "Qatar", "Kuwait", "Turkey", "Egypt", "Nigeria", "Kenya", "Morocco", "Jordan", "Bahrain", "Oman", "Ghana", "Mauritius", "Zambia", "Botswana", "Gabon"],
};
const BY_COUNTRY = new Map(Object.entries(R).flatMap(([region, cs]) => cs.map((c) => [c, region] as const)));
export const REGIONS = Object.keys(R);
export const regionOf = (country: string | null | undefined) => (country ? (BY_COUNTRY.get(country) ?? "Other") : null);
