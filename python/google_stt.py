import argparse
import json
import sys


def emit(payload):
    print(json.dumps(payload, ensure_ascii=False), flush=True)


def extract_text(response):
    if not response:
        return ""
    if isinstance(response, str):
        return response.strip()
    alternatives = response.get("alternative") or []
    if not alternatives:
        return ""
    alternatives = sorted(alternatives, key=lambda item: item.get("confidence", 0), reverse=True)
    return (alternatives[0].get("transcript") or "").strip()


def recognize_once(args):
    try:
        import speech_recognition as sr
    except Exception as error:
        emit({
            "ok": False,
            "error": f"Missing Python dependency: {error}. Run: python -m pip install -r python/requirements.txt"
        })
        return 1

    recognizer = sr.Recognizer()
    recognizer.energy_threshold = args.energy_threshold
    recognizer.dynamic_energy_threshold = True
    recognizer.dynamic_energy_adjustment_damping = 0.10
    recognizer.pause_threshold = max(args.pause_ms / 1000, 0.5)
    recognizer.non_speaking_duration = 0.4
    recognizer.phrase_threshold = 0.1

    try:
        with sr.Microphone(sample_rate=16000) as source:
            recognizer.adjust_for_ambient_noise(source, duration=args.ambient_seconds)
            audio = recognizer.listen(
                source,
                timeout=args.timeout_seconds,
                phrase_time_limit=args.phrase_time_limit
            )
    except sr.WaitTimeoutError:
        emit({"ok": True, "text": "", "reason": "no-speech"})
        return 0
    except Exception as error:
        emit({"ok": False, "error": f"Microphone failed: {error}"})
        return 1

    languages = [args.language]
    if args.fallback_language and args.fallback_language not in languages:
        languages.append(args.fallback_language)

    last_error = ""
    for language in languages:
        try:
            response = recognizer.recognize_google(audio, language=language, show_all=True)
            text = extract_text(response)
            if text:
                emit({"ok": True, "text": text, "language": language})
                return 0
        except sr.UnknownValueError:
            emit({"ok": True, "text": "", "reason": "unknown"})
            return 0
        except sr.RequestError as error:
            last_error = str(error)
        except Exception as error:
            last_error = str(error)

    if last_error:
        emit({"ok": False, "error": f"Google speech recognition failed: {last_error}"})
        return 1

    emit({"ok": True, "text": "", "reason": "unknown"})
    return 0


def main():
    parser = argparse.ArgumentParser(description="PDFistic Google speech recognition bridge")
    parser.add_argument("--language", default="en-IN")
    parser.add_argument("--fallback-language", default="hi-IN")
    parser.add_argument("--pause-ms", type=int, default=2000)
    parser.add_argument("--timeout-seconds", type=float, default=8)
    parser.add_argument("--phrase-time-limit", type=float, default=30)
    parser.add_argument("--ambient-seconds", type=float, default=0.35)
    parser.add_argument("--energy-threshold", type=int, default=150)
    args = parser.parse_args()
    return recognize_once(args)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        emit({"ok": False, "error": "Speech recognition was stopped."})
        raise SystemExit(130)
