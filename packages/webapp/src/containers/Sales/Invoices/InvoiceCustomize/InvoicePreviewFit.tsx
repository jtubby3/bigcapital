import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/** Fit the preview to its pane without changing the invoice's print dimensions. */
export function InvoicePreviewFit({
  paperWidth,
  children,
}: {
  paperWidth: number;
  children: ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const paperRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: paperWidth, height: 1056 });

  useLayoutEffect(() => {
    const container = containerRef.current;
    const paper = paperRef.current;
    if (!container || !paper) return;
    const measure = () => {
      const width = Math.max(1, container.clientWidth - 32);
      const height = paper.offsetHeight;
      setSize((previous) =>
        previous.width === width && previous.height === height
          ? previous
          : { width, height },
      );
    };
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    observer.observe(paper);
    measure();
    return () => observer.disconnect();
  }, [paperWidth]);

  const scale = size.width / paperWidth;
  return (
    <div
      ref={containerRef}
      data-testId="invoice-preview-fit"
      style={{
        padding: '24px 16px',
        minWidth: 0,
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          width: paperWidth * scale,
          height: size.height * scale,
          margin: '0 auto',
        }}
      >
        <div
          ref={paperRef}
          style={{
            width: paperWidth,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
