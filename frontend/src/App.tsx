import { useState, useRef, useCallback } from "react";
import "./App.css";

type TranscriptLine = {
  text: string;
  start: number;
  duration: number;
};

function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcriptText, setTranscriptText] = useState("");
  const [transcriptLines, setTranscriptLines] = useState<TranscriptLine[]>([]);
  const [error, setError] = useState("");
  const [recordingTime, setRecordingTime] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  const startRecording = useCallback(async () => {
    setError("");
    setTranscriptText("");
    setTranscriptLines([]);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        await sendAudio(blob);
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      timerRef.current = window.setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } catch {
      setError("マイクへのアクセスが許可されませんでした。");
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  }, [isRecording]);

  const sendAudio = async (blob: Blob) => {
    setIsTranscribing(true);
    setError("");

    const formData = new FormData();
    formData.append("file", blob, "recording.webm");

    try {
      const res = await fetch("/api/transcribe", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) throw new Error(`Server error: ${res.status}`);

      const data = await res.json();
      setTranscriptText(data.text);
      setTranscriptLines(data.lines || []);
    } catch {
      setError(
        "書き起こしに失敗しました。バックエンドが起動しているか確認してください。"
      );
    } finally {
      setIsTranscribing(false);
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="app">
      <h1>音声文字起こし</h1>
      <p className="subtitle">Moonshine AI - ローカル音声認識</p>

      <div className="recorder">
        {isRecording && (
          <div className="recording-indicator">
            <span className="pulse" />
            録音中... {formatTime(recordingTime)}
          </div>
        )}

        <div className="controls">
          {!isRecording ? (
            <button
              className="btn record"
              onClick={startRecording}
              disabled={isTranscribing}
            >
              録音開始
            </button>
          ) : (
            <button className="btn stop" onClick={stopRecording}>
              録音停止
            </button>
          )}
        </div>

        {isTranscribing && (
          <div className="transcribing">
            <div className="spinner" />
            文字起こし中...
          </div>
        )}
      </div>

      {error && <div className="error">{error}</div>}

      {transcriptText && (
        <div className="result">
          <h2>文字起こし結果</h2>
          <div className="transcript-text">{transcriptText}</div>

          {transcriptLines.length > 0 && (
            <div className="transcript-lines">
              <h3>詳細</h3>
              {transcriptLines.map((line, i) => (
                <div key={i} className="line">
                  <span className="timestamp">{line.start.toFixed(1)}s</span>
                  <span className="text">{line.text}</span>
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
