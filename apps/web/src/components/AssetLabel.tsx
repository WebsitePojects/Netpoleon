import type { Unit } from '@wms/contracts';
import { useMemo } from 'react';
import { code128 } from '../lib/barcode.js';
import { QrCode } from './QrCode.js';

/** A Code 128 barcode drawn as SVG rects, so it prints at any size without blurring. */
export function Barcode({ value }: { value: string }) {
  const barcode = useMemo(() => code128(value), [value]);
  return (
    <svg
      className="barcode"
      viewBox={`0 0 ${barcode.width} 40`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`Barcode for ${value}`}
      shapeRendering="crispEdges"
    >
      <rect width={barcode.width} height={40} fill="#fff" />
      {barcode.bars.map((bar) => (
        <rect key={bar.x} x={bar.x} width={bar.width} height={40} fill="#000" />
      ))}
    </svg>
  );
}

/**
 * One printed asset label: QR code and barcode of the asset code (what the scanner reads at
 * release and return), the code in text for a person, and the model. Sized in millimetres.
 */
export function AssetLabel({
  unit,
  showSerial,
}: {
  unit: Pick<Unit, 'code' | 'brand' | 'model' | 'serial'>;
  showSerial: boolean;
}) {
  return (
    <div className="asset-label">
      <div className="asset-label-qr">
        <QrCode value={unit.code} />
      </div>
      <div className="asset-label-text">
        <strong className="mono">{unit.code}</strong>
        <span>
          {unit.brand} {unit.model}
        </span>
        {showSerial && <span className="mono">S/N {unit.serial}</span>}
        <Barcode value={unit.code} />
      </div>
    </div>
  );
}
