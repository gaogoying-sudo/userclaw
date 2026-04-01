export type ExternalCapabilityType = 'tool' | 'skill';
export type ExternalRiskLevel = 'low' | 'medium' | 'high';

export interface ExternalCapabilityManifest {
  id: string;
  name: string;
  capabilityType: ExternalCapabilityType;
  adapted: boolean;
  source: string;
  adaptedFrom: string;
  version: string;
  riskLevel: ExternalRiskLevel;
  adapterId: string;
  description: string;
}
