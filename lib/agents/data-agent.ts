export const cityData = {
  dataset: "illustrative-city-data" as const,
  asOf: "2026-01-01",
  limitations:
    "Controlled hackathon fixture, not a current price or safety survey. USD monthly estimates; qualitative scores are illustrative.",
  cities: [
    {
      city: "Kuala Lumpur",
      monthlyCostEstimate: 1200,
      internetScore: 9,
      safetyScore: 8,
      coworkingScore: 9,
    },
    {
      city: "Bangkok",
      monthlyCostEstimate: 1300,
      internetScore: 9,
      safetyScore: 8,
      coworkingScore: 10,
    },
    {
      city: "Da Nang",
      monthlyCostEstimate: 900,
      internetScore: 8,
      safetyScore: 9,
      coworkingScore: 7,
    },
  ],
};
