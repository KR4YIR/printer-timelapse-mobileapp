import type { GcodeModifierOptions } from '../types';

const DEFAULT_OPTIONS: GcodeModifierOptions = {
  parkX: 0,
  parkY: 220,
  parkZHop: 2,
  retractLength: 1,
  dwellMs: 2000,
  travelSpeed: 9000,
};

const LAYER_CHANGE_PATTERNS = [
  /;LAYER:(\d+)/i,
  /;AFTER_LAYER_CHANGE/i,
  /; layer (\d+)/i,
  /;Z:[\d.]+/i,
  /;LAYER_CHANGE/i,
  /; move to next layer/i,
];

function buildParkSequence(opts: GcodeModifierOptions): string[] {
  const lines: string[] = [];
  lines.push('; >>> TIMELAPSE PARK START');
  lines.push('M400 ; wait for moves to finish');
  lines.push(`G91 ; relative positioning`);
  lines.push(`G1 E-${opts.retractLength} F2400 ; retract`);
  lines.push(`G1 Z${opts.parkZHop} F600 ; z-hop`);
  lines.push(`G90 ; absolute positioning`);
  lines.push(`G1 X${opts.parkX} Y${opts.parkY} F${opts.travelSpeed} ; park head`);
  lines.push(`G4 P${opts.dwellMs} ; dwell for photo capture`);
  lines.push(`; <<< TIMELAPSE PARK END`);
  return lines;
}

function buildUnparkSequence(opts: GcodeModifierOptions): string[] {
  const lines: string[] = [];
  lines.push('; >>> TIMELAPSE UNPARK START');
  lines.push(`G91 ; relative positioning`);
  lines.push(`G1 Z-${opts.parkZHop} F600 ; undo z-hop`);
  lines.push(`G1 E${opts.retractLength} F2400 ; unretract`);
  lines.push(`G90 ; absolute positioning`);
  lines.push('; <<< TIMELAPSE UNPARK END');
  return lines;
}

function isLayerChange(line: string): boolean {
  return LAYER_CHANGE_PATTERNS.some((p) => p.test(line));
}

export function modifyGcode(
  gcodeContent: string,
  options: Partial<GcodeModifierOptions> = {}
): ModifyResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const lines = gcodeContent.split('\n');
  const output: string[] = [];
  let layersModified = 0;
  let firstLayerSkipped = false;

  const parkSeq = buildParkSequence(opts);
  const unparkSeq = buildUnparkSequence(opts);

  let lastX: number | null = null;
  let lastY: number | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    const xMatch = trimmed.match(/G[01]\s.*X([\d.]+)/);
    const yMatch = trimmed.match(/G[01]\s.*Y([\d.]+)/);
    if (xMatch) lastX = parseFloat(xMatch[1]);
    if (yMatch) lastY = parseFloat(yMatch[1]);

    output.push(line);

    if (isLayerChange(trimmed)) {
      if (!firstLayerSkipped) {
        firstLayerSkipped = true;
        continue;
      }

      output.push(...parkSeq);

      if (lastX !== null && lastY !== null) {
        output.push(
          `G1 X${lastX} Y${lastY} F${opts.travelSpeed} ; return to print position`
        );
      }
      output.push(...unparkSeq);

      layersModified++;
    }
  }

  const header = [
    '; ============================================',
    '; Modified by G-code Timelapse App',
    `; Park position: X${opts.parkX} Y${opts.parkY}`,
    `; Z-hop: ${opts.parkZHop}mm`,
    `; Dwell: ${opts.dwellMs}ms`,
    `; Layers modified: ${layersModified}`,
    '; ============================================',
    '',
  ];

  return {
    gcode: [...header, ...output].join('\n'),
    layersModified,
    originalLineCount: lines.length,
    modifiedLineCount: header.length + output.length,
  };
}

export function analyzeGcode(gcodeContent: string): GcodeAnalysis {
  const lines = gcodeContent.split('\n');
  let layerCount = 0;
  let maxZ = 0;
  let estimatedTime = 0;
  let slicer = 'Unknown';

  for (const line of lines) {
    const trimmed = line.trim();

    if (isLayerChange(trimmed)) {
      layerCount++;
    }

    const zMatch = trimmed.match(/;Z:([\d.]+)/);
    if (zMatch) {
      maxZ = Math.max(maxZ, parseFloat(zMatch[1]));
    }

    if (trimmed.includes('PrusaSlicer') || trimmed.includes('Prusa Slicer')) {
      slicer = 'PrusaSlicer';
    } else if (trimmed.includes('Cura') || trimmed.includes('CURA')) {
      slicer = 'Cura';
    } else if (trimmed.includes('OrcaSlicer')) {
      slicer = 'OrcaSlicer';
    } else if (trimmed.includes('SuperSlicer')) {
      slicer = 'SuperSlicer';
    }

    const timeMatch = trimmed.match(/;estimated printing time.*?=\s*(.*)/i);
    if (timeMatch) {
      estimatedTime = parseTimeString(timeMatch[1]);
    }
  }

  return {
    layerCount,
    maxZ,
    estimatedTime,
    slicer,
    lineCount: lines.length,
  };
}

function parseTimeString(timeStr: string): number {
  let seconds = 0;
  const hours = timeStr.match(/(\d+)\s*h/);
  const minutes = timeStr.match(/(\d+)\s*m/);
  const secs = timeStr.match(/(\d+)\s*s/);
  if (hours) seconds += parseInt(hours[1]) * 3600;
  if (minutes) seconds += parseInt(minutes[1]) * 60;
  if (secs) seconds += parseInt(secs[1]);
  return seconds;
}

export interface ModifyResult {
  gcode: string;
  layersModified: number;
  originalLineCount: number;
  modifiedLineCount: number;
}

export interface GcodeAnalysis {
  layerCount: number;
  maxZ: number;
  estimatedTime: number;
  slicer: string;
  lineCount: number;
}
