/** `10 kg` / `BW`, or `10 kg assist` when kg is help rather than extra load. */
export function formatLoad(weightKg: number, assisted = false): string {
  if (!(weightKg > 0)) return 'BW';
  return assisted ? `${weightKg} kg assist` : `${weightKg} kg`;
}
