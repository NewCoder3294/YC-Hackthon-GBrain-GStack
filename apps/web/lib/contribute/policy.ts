export interface ContributorDefaultPolicy {
  geofenceMeters: number;
  allowedIncidentTypes: "all";
  warrantRequirement: "exigent_ok";
  timeWindows: "24/7";
}

export const DEFAULT_POLICY: ContributorDefaultPolicy = {
  geofenceMeters: 500,
  allowedIncidentTypes: "all",
  warrantRequirement: "exigent_ok",
  timeWindows: "24/7",
};
