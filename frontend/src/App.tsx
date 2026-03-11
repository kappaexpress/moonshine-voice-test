import { useState, useRef, useCallback, useEffect } from "react";
import "./App.css";

type StreamingLine = {
  lineId: string;
  text: string;
  start: number;
  duration: number;
  isComplete: boolean;
};

function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [lines, setLines] = useState<StreamingLine[]>([]);
  const [error, setError] = useState("");

  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    audioContextRef.current?.close();
    audioContextRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    wsRef.current?.close();
    wsRef.current = null;
  }, []);

  const startRecording = useCallback(async () => {
    setError("");
    setLines([]);

    try {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(
        `${protocol}//${window.location.host}/api/ws/transcribe`
      );
      wsRef.current = ws;

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        setLines((prev) => {
          const line: StreamingLine = {
            lineId: data.line_id,
            text: data.text,
            start: data.start,
            duration: data.duration,
            isComplete: data.is_complete,
          };
          const idx = prev.findIndex((l) => l.lineId === data.line_id);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = line;
            return next;
          }
          return [...prev, line];
        });
      };

      ws.onerror = () => {
        setError("WebSocket接続エラーが発生しました。");
      };

      await new Promise<void>((resolve, reject) => {
        ws.onopen = () => resolve();
        ws.onerror = () => reject();
      });

      const mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      streamRef.current = mediaStream;

      const audioContext = new AudioContext({ sampleRate: 16000 });
      audioContextRef.current = audioContext;

      await audioContext.audioWorklet.addModule("/audio-processor.js");

      const source = audioContext.createMediaStreamSource(mediaStream);
      const processor = new AudioWorkletNode(
        audioContext,
        "audio-stream-processor"
      );

      processor.port.onmessage = (e) => {
        if (ws.readyState === WebSocket.OPEN) {
          const float32: Float32Array = e.data;
          ws.send(float32.buffer);
        }
      };

      source.connect(processor);

      setIsRecording(true);
      setRecordingTime(0);
      timerRef.current = window.setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } catch {
      setError(
        "マイクへのアクセスまたはWebSocket接続に失敗しました。"
      );
      cleanup();
    }
  }, [cleanup]);

  const stopRecording = useCallback(() => {
    cleanup();
    setIsRecording(false);
  }, [cleanup]);

  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const fullText = lines
    .filter((l) => l.text)
    .map((l) => l.text)
    .join("");

  return (
    <div className="app">
      <h1>音声文字起こし</h1>
      <p className="subtitle">Moonshine AI - リアルタイム音声認識</p>

      <div className="recorder">
        {isRecording && (
          <div className="recording-indicator">
            <span className="pulse" />
            録音中... {formatTime(recordingTime)}
          </div>
        )}

        <div className="controls">
          {!isRecording ? (
            <button className="btn record" onClick={startRecording}>
              録音開始
            </button>
          ) : (
            <button className="btn stop" onClick={stopRecording}>
              録音停止
            </button>
          )}
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      {(isRecording || lines.length > 0) && (
        <div className="result">
          <h2>文字起こし結果</h2>
          <div className="transcript-text">
            {fullText || (
              <span className="placeholder">音声を待っています...</span>
            )}
          </div>

          {lines.length > 0 && (
            <div className="transcript-lines">
              <h3>詳細</h3>
              {lines.map((line) => (
                <div
                  key={line.lineId}
                  className={`line ${line.isComplete ? "" : "in-progress"}`}
                >
                  <span className="timestamp">{line.start.toFixed(1)}s</span>
                  <span className="text">{line.text}</span>
                  {!line.isComplete && (
                    <span className="typing-indicator">...</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default App;
