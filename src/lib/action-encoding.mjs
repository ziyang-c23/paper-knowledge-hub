/** Teaching values in normalized [-1,1]; never physical robot commands. */
export function encodeAction(value, { bins = 256, convention = 'uniform-bins' } = {}) {
  const clipped = Math.max(-1, Math.min(1, value));
  if (convention === 'openvla-tokenizer') {
    // np.linspace(-1,1,bins); np.digitize(right=False); clipped inverse center lookup.
    const index = clipped === 1 ? bins : Math.floor(((clipped + 1) / 2) * (bins - 1)) + 1;
    const centerIndex = Math.max(0, Math.min(bins - 2, index - 1));
    return {
      clipped,
      index,
      center: -1 + ((centerIndex + 0.5) * 2) / (bins - 1),
      intervals: bins - 1,
    };
  }
  const index = Math.min(bins - 1, Math.floor(((clipped + 1) / 2) * bins));
  return { clipped, index, center: -1 + ((index + 0.5) * 2) / bins, intervals: bins };
}
