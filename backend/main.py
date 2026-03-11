import io
import asyncio
import numpy as np
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydub import AudioSegment
from moonshine_voice import Transcriber, get_model_for_language

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

model_path, model_arch = get_model_for_language("ja")
transcriber = Transcriber(model_path=model_path, model_arch=model_arch)


@app.websocket("/api/ws/transcribe")
async def websocket_transcribe(websocket: WebSocket):
    await websocket.accept()

    loop = asyncio.get_running_loop()
    stream = transcriber.create_stream()

    def on_event(event):
        try:
            line = event.line
            data = {
                "line_id": str(line.line_id),
                "text": line.text,
                "start": line.start_time,
                "duration": line.duration,
                "is_complete": line.is_complete,
            }
            asyncio.run_coroutine_threadsafe(
                websocket.send_json(data), loop
            )
        except Exception:
            pass

    stream.add_listener(on_event)

    try:
        while True:
            data = await websocket.receive_bytes()
            samples = np.frombuffer(data, dtype="<f4").tolist()
            stream.add_audio(samples, 16000)
    except WebSocketDisconnect:
        pass
    finally:
        stream.remove_listener(on_event)
        stream.close()


@app.post("/api/transcribe")
async def transcribe(file: UploadFile = File(...)):
    audio_bytes = await file.read()

    audio = AudioSegment.from_file(io.BytesIO(audio_bytes))
    audio = audio.set_channels(1).set_frame_rate(16000).set_sample_width(2)

    samples = np.array(audio.get_array_of_samples(), dtype=np.float32) / 32768.0

    transcript = transcriber.transcribe_without_streaming(samples.tolist(), 16000)

    lines = [
        {"text": line.text, "start": line.start_time, "duration": line.duration}
        for line in transcript.lines
    ]
    full_text = " ".join(line.text for line in transcript.lines).strip()

    return {"text": full_text, "lines": lines}


@app.get("/api/health")
async def health():
    return {"status": "ok"}
