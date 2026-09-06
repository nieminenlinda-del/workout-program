export function VoiceToggle({
  enabled,
  onChange,
}: {
  enabled: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      className={`toggle voice-toggle ${enabled ? 'on apply-on' : ''}`}
      onClick={() => onChange(!enabled)}
      aria-pressed={enabled}
    >
      {enabled ? 'Voice on' : 'Voice off'}
    </button>
  );
}
