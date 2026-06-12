// Read/write the Mask field of a border entry as one of four authoring modes.
export type MaskMode = 'none' | 'image' | '#COPY' | '#OVERLAY';

export function readMaskMode(entry: any): MaskMode {
  const m = entry?.Mask;
  if (m == null) return 'none';
  if (typeof m === 'string') return m === '#OVERLAY' ? '#OVERLAY' : '#COPY'; // any other string is a copy ref
  if (typeof m === 'object') return typeof m.Cells === 'string' ? '#COPY' : 'image';
  return 'none';
}

// Mutate entry.Mask to the chosen mode, keeping existing Image/Cells where it makes sense.
export function setMaskMode(entry: any, mode: MaskMode): void {
  switch (mode) {
    case 'none':
      delete entry.Mask;
      return;
    case '#OVERLAY':
      entry.Mask = '#OVERLAY';
      return;
    case '#COPY': {
      const prev = typeof entry.Mask === 'object' ? entry.Mask : {};
      entry.Mask = { ...prev, Cells: '#COPY' };
      return;
    }
    case 'image': {
      const prev = typeof entry.Mask === 'object' ? entry.Mask : {};
      entry.Mask = {
        Image: prev.Image ?? '',
        EdgeFill: prev.EdgeFill ?? ['STRETCH', 'STRETCH'],
        CenterFill: prev.CenterFill ?? ['STRETCH', 'STRETCH'],
        Cells: Array.isArray(prev.Cells) ? prev.Cells : [[0, 1], [0, 1]],
      };
      return;
    }
  }
}
