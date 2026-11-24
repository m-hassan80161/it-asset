import { useEffect, useRef, useState } from "react";
import type { IScannerControls } from "@zxing/browser";

interface BarcodeCameraScannerProps {
  onDetected: (value: string) => void;
}

export function BarcodeCameraScanner({ onDetected }: BarcodeCameraScannerProps) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!open) return;

    let active = true;
    let controls: IScannerControls | undefined;
    void import("@zxing/browser").then(({ BarcodeFormat, BrowserMultiFormatReader }) => {
      if (!active) return;
      const reader = new BrowserMultiFormatReader();
      reader.possibleFormats = [BarcodeFormat.CODE_128];
      return reader.decodeFromConstraints(
        { video: { facingMode: { ideal: "environment" } } },
        videoRef.current ?? undefined,
        (result) => {
          if (!result || !active) return;
          const value = result.getText();
          if (!value) return;
          active = false;
          controls?.stop();
          setOpen(false);
          onDetected(value);
        },
      ).then((scannerControls) => {
        if (active) {
          controls = scannerControls;
        } else {
          scannerControls.stop();
        }
      });
    }).catch(() => {
      if (active) {
        setError("تعذر تشغيل الكاميرا. تحقق من الإذن واستخدم الصفحة عبر HTTPS.");
      }
    });

    return () => {
      active = false;
      controls?.stop();
    };
  }, [open, onDetected]);

  const startScanner = () => {
    setError("");
    setOpen(true);
  };

  return (
    <div className="space-y-2">
      {open ? (
        <button type="button" onClick={() => setOpen(false)} className="rounded border px-3 py-2 text-sm">إيقاف الكاميرا</button>
      ) : (
        <button type="button" onClick={startScanner} className="whitespace-nowrap rounded border border-blue-700 px-3 py-2 text-sm text-blue-700 hover:bg-blue-50">مسح بالكاميرا</button>
      )}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {open && <video ref={videoRef} autoPlay muted playsInline className="w-full max-w-sm rounded border bg-black" aria-label="معاينة كاميرا مسح الباركود" />}
    </div>
  );
}
