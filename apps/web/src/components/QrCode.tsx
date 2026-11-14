import qrcode from 'qrcode-generator';
import { useMemo } from 'react';

/** A QR code for `value`, drawn as one SVG path so it prints crisply at label size. */
export function QrCode({ value }: { value: string }) {
  const { path, size } = useMemo(() => {
    // Type 0 picks the smallest version that fits; M tolerates a scuffed label.
    const code = qrcode(0, 'M');
    code.addData(value);
    code.make();
    const count = code.getModuleCount();
    let d = '';
    for (let row = 0; row < count; row += 1) {
      for (let column = 0; column < count; column += 1) {
        if (code.isDark(row, column)) d += `M${column} ${row}h1v1h-1z`;
      }
    }
    return { path: d, size: count };
  }, [value]);

  const QUIET_ZONE = 2;
  const box = size + QUIET_ZONE * 2;
  return (
    <svg
      viewBox={`${-QUIET_ZONE} ${-QUIET_ZONE} ${box} ${box}`}
      role="img"
      aria-label={`QR code for ${value}`}
      shapeRendering="crispEdges"
    >
      <rect x={-QUIET_ZONE} y={-QUIET_ZONE} width={box} height={box} fill="#fff" />
      <path d={path} fill="#0e1f19" />
    </svg>
  );
}
