export declare const MANUFACTURER: { garmin: number; polarElectro: number; coros: number };
export interface FitRecord {
  timestamp: Date;
  distance?: number;
  speed?: number;
  enhancedSpeed?: number;
  heartRate?: number;
  cadence?: number;
  positionLat?: number;
  positionLong?: number;
  altitude?: number;
}
export interface FitSession {
  timestamp: Date;
  startTime: Date;
  sport?: "running" | "cycling";
  subSport?: "generic" | "treadmill" | "trail" | "track";
  totalElapsedTime?: number;
  totalTimerTime?: number;
  totalDistance?: number;
  avgHeartRate?: number;
  maxHeartRate?: number;
  avgCadence?: number;
}
export declare function buildFit(a: { fileId: { manufacturer: keyof typeof MANUFACTURER; product?: number; timeCreated: Date }; records: FitRecord[]; session?: FitSession }): Buffer;
