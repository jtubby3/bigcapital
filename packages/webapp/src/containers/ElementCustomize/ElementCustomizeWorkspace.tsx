import { useId, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import { ElementCustomizeFields } from './ElementCustomizeFields';
import { ElementCustomizePreview } from './ElementCustomizePreview';
import styles from './ElementCustomize.module.scss';

const storageKey = 'invoice-template-editor-width';
const dividerWidth = 10;
const readWidth = () => {
  try {
    const value = Number(window.localStorage.getItem(storageKey));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
};

/** Resizes only the editing workspace; invoice print dimensions stay unchanged. */
export function ElementCustomizeWorkspace() {
  const workspaceRef = useRef<HTMLDivElement>(null);
  const fieldsId = useId();
  const [preferredWidth, setPreferredWidth] = useState<number | null>(
    readWidth,
  );
  const preferredRef = useRef(preferredWidth);
  const [workspaceWidth, setWorkspaceWidth] = useState(1024);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ pointerId: number; offset: number } | null>(null);

  useLayoutEffect(() => {
    const workspace = workspaceRef.current;
    if (!workspace) return;
    const measure = () => setWorkspaceWidth(workspace.clientWidth);
    const observer = new ResizeObserver(measure);
    observer.observe(workspace);
    measure();
    return () => observer.disconnect();
  }, []);

  const minimum = Math.min(
    workspaceWidth <= 700 ? 300 : 350,
    workspaceWidth * 0.55,
  );
  const maximum = Math.max(
    minimum,
    Math.min(
      800,
      workspaceWidth - dividerWidth - Math.min(280, workspaceWidth * 0.35),
    ),
  );
  const clamp = (value: number) =>
    Math.round(Math.max(minimum, Math.min(maximum, value)));
  const defaultWidth =
    workspaceWidth <= 700 ? 300 : Math.min(565, workspaceWidth * 0.42);
  const width = clamp(preferredWidth ?? defaultWidth);

  const remember = (value: number | null) => {
    try {
      if (value === null) window.localStorage.removeItem(storageKey);
      else window.localStorage.setItem(storageKey, String(value));
    } catch {
      // Resizing still works when browser storage is unavailable.
    }
  };
  const changeWidth = (value: number | null, persist = false) => {
    const next = value === null ? null : clamp(value);
    preferredRef.current = next;
    setPreferredWidth(next);
    if (persist) remember(next);
  };
  const startDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const workspace = workspaceRef.current;
    if (!workspace) return;
    event.preventDefault();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      offset: event.clientX - workspace.getBoundingClientRect().left - width,
    };
    setDragging(true);
  };
  const moveDrag = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const workspace = workspaceRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !workspace) return;
    changeWidth(
      event.clientX - workspace.getBoundingClientRect().left - drag.offset,
    );
  };
  const finishDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    remember(preferredRef.current);
  };
  const handleKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 50 : 20;
    const next =
      event.key === 'ArrowLeft'
        ? width - step
        : event.key === 'ArrowRight'
          ? width + step
          : event.key === 'Home'
            ? minimum
            : event.key === 'End'
              ? maximum
              : event.key === 'Enter'
                ? null
                : undefined;
    if (next === undefined) return;
    event.preventDefault();
    changeWidth(next, true);
  };

  return (
    <div
      ref={workspaceRef}
      className={styles.workspace}
      style={{
        gridTemplateColumns: `${width}px ${dividerWidth}px minmax(0, 1fr)`,
      }}
      data-testId="customize-workspace"
      data-resizing={dragging}
    >
      <ElementCustomizeFields id={fieldsId} />
      <div
        className={styles.resizer}
        role="separator"
        tabIndex={0}
        aria-label="Resize editor and invoice preview"
        aria-orientation="vertical"
        aria-controls={fieldsId}
        aria-valuemin={Math.round(minimum)}
        aria-valuemax={Math.round(maximum)}
        aria-valuenow={width}
        aria-valuetext={`${width} pixels for editing controls`}
        title="Drag to resize. Use left/right arrows, or double-click to reset."
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
        onLostPointerCapture={finishDrag}
        onKeyDown={handleKey}
        onDoubleClick={() => changeWidth(null, true)}
      />
      <ElementCustomizePreview />
    </div>
  );
}
