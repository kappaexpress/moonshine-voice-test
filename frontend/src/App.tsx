import { useState, useRef, useCallback, useEffect } from "react";
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
  const [language, setLanguage] = useState("en");
  const [languages, setLanguages] = useState<Record<string, string>>({});

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    fetch("/api/languages")
      .then((res) => res.json())
      .then(setLanguages)
      .catch(() => {});
  }, []);

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
  }, [language]);

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
    formData.append("language", language);

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
      <h1>Voice Transcriber</h1>
      <p className="subtitle">Moonshine AI - Local Speech-to-Text</p>

      <div className="recorder">
        <div className="language-select">
          <label htmlFor="lang">Language:</label>
          <select
            id="lang"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            disabled={isRecording || isTranscribing}
          >
            {Object.entries(languages).map(([code, name]) => (
              <option key={code} value={code}>
                {name} ({code})
              </option>
            ))}
          </select>
        </div>

        {isRecording && (
          <div className="recording-indicator">
            <span className="pulse" />
            Recording... {formatTime(recordingTime)}
          </div>
        )}

        <div className="controls">
          {!isRecording ? (
            <button
              className="btn record"
              onClick={startRecording}
              disabled={isTranscribing}
            >
              Start Recording
            </button>
          ) : (
            <button className="btn stop" onClick={stopRecording}>
              Stop Recording
            </button>
          )}
        </div>

        {isTranscribing && (
          <div className="transcribing">
            <div className="spinner" />
            Transcribing...
          </div>
        )}
      </div>

      {error && <div className="error">{error}</div>}

      {transcriptText && (
        <div className="result">
          <h2>Transcription</h2>
          <div className="transcript-text">{transcriptText}</div>

          {transcriptLines.length > 0 && (
            <div className="transcript-lines">
              <h3>Details</h3>
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
