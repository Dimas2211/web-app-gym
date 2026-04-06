/**
 * Captures an SVG element as a PNG base64 data URL.
 * Used to embed chart images in PDF exports via jsPDF addImage().
 *
 * The SVG is serialized to a data URI, drawn onto a 2× canvas for sharpness,
 * and returned as a PNG data URL. Returns null on any failure so callers can
 * skip the chart gracefully.
 */
export async function captureChartAsPng(
  svgEl: SVGSVGElement | null
): Promise<string | null> {
  if (!svgEl) return null;
  return new Promise((resolve) => {
    try {
      const vbW = svgEl.viewBox?.baseVal?.width || svgEl.clientWidth || 560;
      const vbH = svgEl.viewBox?.baseVal?.height || svgEl.clientHeight || 220;

      const serializer = new XMLSerializer();
      let svgStr = serializer.serializeToString(svgEl);

      // Ensure required XML namespace is present
      if (!svgStr.includes("xmlns=")) {
        svgStr = svgStr.replace("<svg", `<svg xmlns="http://www.w3.org/2000/svg"`);
      }

      // Use data URI directly — avoids Blob URL security restrictions
      const dataURL = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgStr)}`;
      const img = new Image();

      img.onload = () => {
        const SCALE = 2; // 2× for crisp PDF rendering
        const canvas = document.createElement("canvas");
        canvas.width = vbW * SCALE;
        canvas.height = vbH * SCALE;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.scale(SCALE, SCALE);
        ctx.drawImage(img, 0, 0, vbW, vbH);
        resolve(canvas.toDataURL("image/png"));
      };

      img.onerror = () => resolve(null);
      img.src = dataURL;
    } catch {
      resolve(null);
    }
  });
}
