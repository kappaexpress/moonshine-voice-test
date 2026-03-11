import io
import numpy as np
from fastapi import FastAPI, UploadFile, File, Form
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

SUPPORTED_LANGUAGES = {
    "en": "English",
    "ja": "Japanese",
    "es": "Spanish",
    "zh": "Chinese",
    "ko": "Korean",
    "ar": "Arabic",
    "vi": "Vietnamese",
    "uk": "Ukrainian",
}

transcribers: dict[str, Transcriber] = {}


def get_transcriber(lang: str) -> Transcriber:
    if lang not in transcribers:
        model_path, model_arch = get_model_for_language(lang)
        transcribers[lang] = Transcriber(model_path=model_path, model_arch=model_arch)
    return transcribers[lang]


# Pre-load English model at startup
get_transcriber("en")


@app.post("/api/transcribe")
async def transcribe(file: UploadFile = File(...), language: str = Form("en")):
    if language not in SUPPORTED_LANGUAGES:
        language = "en"

    audio_bytes = await file.read()

    audio = AudioSegment.from_file(io.BytesIO(audio_bytes))
    audio = audio.set_channels(1).set_frame_rate(16000).set_sample_width(2)

    samples = np.array(audio.get_array_of_samples(), dtype=np.float32) / 32768.0
    sample_rate = 16000

    t = get_transcriber(language)
    transcript = t.transcribe_without_streaming(samples.tolist(), sample_rate)

    lines = [
        {"text": line.text, "start": line.start_time, "duration": line.duration}
        for line in transcript.lines
    ]
    full_text = " ".join(line.text for line in transcript.lines).strip()

    return {"text": full_text, "lines": lines}


@app.get("/api/languages")
async def languages():
    return SUPPORTED_LANGUAGES


@app.get("/api/health")
async def health():
    return {"status": "ok"}
