// @ts-nocheck
const SERIES_ENVIRONMENT_KEYS = {
  financing: "CVCRM_RESERVATION_SERIES_FINANCING_ID",
  subsidy: "CVCRM_RESERVATION_SERIES_SUBSIDY_ID",
  fgts: "CVCRM_RESERVATION_SERIES_FGTS_ID",
  entry: "CVCRM_RESERVATION_SERIES_ENTRY_ID",
};

export function reservationSeriesId(kind, environment = process.env) {
  const environmentKey = SERIES_ENVIRONMENT_KEYS[kind];
  const value = Number(environment[environmentKey] || 0);

  return Number.isInteger(value) && value > 0 ? value : null;
}

export function reservationDate(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "";
}
