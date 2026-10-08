export type Unit = "mi" | "km";
export const KM_PER_MILE = 1.609344;
export const displayDistance = (km: number, unit: Unit) =>
  unit === "mi" ? km / KM_PER_MILE : km;
export const toKilometers = (value: number, unit: Unit) =>
  unit === "mi" ? value * KM_PER_MILE : value;
export const secondsPerUnit = (secondsPerKm: number, unit: Unit) =>
  unit === "mi" ? secondsPerKm * KM_PER_MILE : secondsPerKm;
export function distanceMessage(message: string, unit: Unit) {
  if (unit === "km") return message;
  return message
    .replace(
      /(\d+(?:\.\d+)?) and (\d+(?:\.\d+)?) km/g,
      (_, a, b) =>
        `${displayDistance(Number(a), unit).toFixed(1)} and ${displayDistance(Number(b), unit).toFixed(1)} mi`,
    )
    .replace(
      /(\d+(?:\.\d+)?) km/g,
      (_, a) => `${displayDistance(Number(a), unit).toFixed(1)} mi`,
    );
}
