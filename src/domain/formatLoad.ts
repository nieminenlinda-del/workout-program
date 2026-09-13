export function formatLoad(weightKg: number): string {
  return weightKg > 0 ? `${weightKg} kg` : 'BW';
}
