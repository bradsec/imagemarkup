import type { Scene } from './types';

const LIMIT = 50;

export class AnnotationHistory {
  private past: Snapshot[] = [];
  private future: Snapshot[] = [];

  canUndo(): boolean { return this.past.length > 0; }
  canRedo(): boolean { return this.future.length > 0; }

  record(scene: Scene): void {
    this.past.push(snapshot(scene));
    if (this.past.length > LIMIT) this.past.shift();
    this.future = [];
  }

  undo(current: Scene): Snapshot | null {
    const previous = this.past.pop();
    if (!previous) return null;
    this.future.push(snapshot(current));
    return previous;
  }

  redo(current: Scene): Snapshot | null {
    const next = this.future.pop();
    if (!next) return null;
    this.past.push(snapshot(current));
    return next;
  }

  clear(): void {
    this.past = [];
    this.future = [];
  }

  sources(): Set<CanvasImageSource> {
    return new Set([...this.past, ...this.future].flatMap(sceneSources));
  }
}

export type Snapshot = Pick<Scene, 'image' | 'viewport' | 'objects' | 'crop' | 'border' | 'watermark'>;

export function sceneSources(scene: Pick<Scene, 'image' | 'objects' | 'watermark'>): CanvasImageSource[] {
  return [scene.image?.source, ...scene.objects.filter((object) => object.type === 'image').map((object) => object.source), scene.watermark?.kind === 'image' ? scene.watermark.source : undefined]
    .filter((source): source is CanvasImageSource => source !== undefined);
}

function snapshot(scene: Scene): Snapshot {
  return {
    image: scene.image,
    viewport: { ...scene.viewport },
    objects: scene.objects.map((object) => object.type === 'image'
      ? { ...structuredClone({ ...object, source: undefined }), source: object.source }
      : structuredClone(object)),
    crop: structuredClone(scene.crop),
    border: structuredClone(scene.border),
    watermark: scene.watermark?.kind === 'image'
      ? { ...structuredClone({ ...scene.watermark, source: undefined }), source: scene.watermark.source }
      : structuredClone(scene.watermark),
  };
}
