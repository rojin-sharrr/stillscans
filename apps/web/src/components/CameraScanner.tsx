import { useEffect, useRef, useState } from "preact/hooks";
import { createVideoDecoder } from "../lib/decode";

const SCAN_INTERVAL_MS = 200;

interface Props {
  onDecoded: (text: string) => void;
  onCancel: () => void;
}

/** Full-screen camera with a framing square and a Cancel button. */
export function CameraScanner({ onDecoded, onCancel }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;

    const start = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
        if (stopped || !video.current) return;
        video.current.srcObject = stream;
        await video.current.play();

        const decode = await createVideoDecoder();
        // Decoding is async, so each scan is scheduled after the last one finishes.
        const scan = async () => {
          const text = video.current ? await decode(video.current) : null;
          if (stopped) return;
          if (text) onDecoded(text);
          else timer = setTimeout(() => void scan().catch(() => setFailed(true)), SCAN_INTERVAL_MS);
        };
        await scan();
      } catch {
        setFailed(true);
      }
    };
    void start();

    return () => {
      stopped = true;
      clearTimeout(timer);
      for (const track of stream?.getTracks() ?? []) track.stop();
    };
  }, [onDecoded]);

  return (
    <div class="camera" role="dialog" aria-modal="true" aria-label="Scan a QR code">
      <video ref={video} playsInline muted />
      <div class="camera__frame" aria-hidden="true" />
      <div class="camera__bar">
        <p class="camera__hint" role="status">
          {failed
            ? "We can't open your camera. Allow access, or upload a photo instead."
            : "Point it at the code."}
        </p>
        <button type="button" class="btn btn-secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
