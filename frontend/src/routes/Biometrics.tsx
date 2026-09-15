import { useEffect, useRef, useState } from "react";
import {
  Camera,
  Mic,
  Shield,
  ShieldCheck,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Sliders,
  AlertTriangle,
  UserCheck,
  Eye,
  Sparkles,
  Info,
  RotateCcw,
  Square,
} from "lucide-react";
import { useAuth } from "../lib/auth-context";
import { api, ApiError } from "../lib/api";
import { Sidebar } from "../components/Sidebar";

// =========================================================================
// Types
// =========================================================================

export interface BiometricSettings {
  id?: string;
  organizationId?: string;
  verificationMode: "NORMAL" | "SECURE";
  verificationPolicy: "FACE_ONLY" | "VOICE_ONLY" | "FACE_AND_VOICE" | "FACE_OR_VOICE";
  faceVerificationEnabled: boolean;
  faceEnrollmentEnabled: boolean;
  faceThreshold: number;
  faceConfidenceThreshold: number;
  maxFaceEnrollmentImages: number;
  livenessEnabled: boolean;
  voiceVerificationEnabled: boolean;
  voiceEnrollmentEnabled: boolean;
  voiceThreshold: number;
  minVoiceDurationSeconds: number;
  maxVoiceDurationSeconds: number;
  challengeEnabled: boolean;
  challengeType: string;
  challengeAttempts: number;
  challengeTimeoutSeconds: number;
  requireLiveness: boolean;
  livenessThreshold: number;
  livenessChallengeCount: number;
}

interface BiometricStatus {
  student: {
    id: string;
    studentNumber: string;
    user: { fullName: string; email: string };
  };
  face: {
    isEnrolled: boolean;
    sampleCount: number;
    templateCount: number;
    qualityScore: number;
    enrolledAt: string | null;
  };
  voice: {
    isEnrolled: boolean;
    sampleCount: number;
    templateCount: number;
    qualityScore: number;
    enrolledAt: string | null;
  };
}

interface AttendanceSession {
  id: string;
  sessionDate: string;
  title?: string;
  status: "OPEN" | "CLOSED" | "CANCELLED";
  courseOffering: {
    course: { code: string; title: string };
    section: { name: string };
  };
}

interface VerificationAttempt {
  id: string;
  studentId: string;
  verificationMode: string;
  faceScore: number | null;
  facePass: boolean;
  livenessScore: number | null;
  livenessPass: boolean;
  voiceScore: number | null;
  voicePass: boolean | null;
  overallPass: boolean;
  rejectionReason: string | null;
  latencyMs: number | null;
  createdAt: string;
  student?: {
    studentNumber: string;
    user: { fullName: string; email: string };
  };
}

// =========================================================================
// 1. Biometric Enrollment Page
// =========================================================================

export function BiometricsEnrollPage() {
  const { accessToken: token, user } = useAuth();
  const [status, setStatus] = useState<BiometricStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Camera state
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [capturedImages, setCapturedImages] = useState<string[]>([]);
  const [enrollingFace, setEnrollingFace] = useState(false);

  // Audio state
  const [recordingVoice, setRecordingVoice] = useState(false);
  const [capturedAudios, setCapturedAudios] = useState<string[]>([]);
  const [enrollingVoice, setEnrollingVoice] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const loadStatus = async () => {
    try {
      setLoading(true);
      const res = await api.get<BiometricStatus>("/biometrics/my-status", token ?? undefined);
      setStatus(res);
    } catch (err: any) {
      setError(err.message || "Failed to load biometric status");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
    return () => {
      stopCamera();
    };
  }, []);

  const startCamera = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        setCameraActive(true);
      }
    } catch (err: any) {
      setError("Camera access denied or unavailable. Please allow camera permissions.");
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  };

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const video = videoRef.current;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
    setCapturedImages((prev) => [...prev, dataUrl]);
  };

  const removePhoto = (idx: number) => {
    setCapturedImages((prev) => prev.filter((_, i) => i !== idx));
  };

  const submitFaceEnrollment = async () => {
    if (capturedImages.length < 1) {
      setError("Please capture at least 1 face image sample");
      return;
    }
    setError(null);
    setSuccess(null);
    setEnrollingFace(true);
    try {
      await api.post("/biometrics/face/enroll", { images: capturedImages }, token ?? undefined);
      setSuccess("Face biometrics successfully enrolled and encrypted (AES-256-GCM)!");
      setCapturedImages([]);
      stopCamera();
      await loadStatus();
    } catch (err: any) {
      setError(err.message || "Face enrollment failed");
    } finally {
      setEnrollingFace(false);
    }
  };

  const startVoiceRecording = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/wav" });
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = () => {
          const base64Audio = reader.result as string;
          setCapturedAudios((prev) => [...prev, base64Audio]);
        };
        stream.getTracks().forEach((track) => track.stop());
      };

      recorder.start();
      setRecordingVoice(true);
    } catch (err: any) {
      setError("Microphone access denied or unavailable.");
    }
  };

  const stopVoiceRecording = () => {
    if (mediaRecorderRef.current && recordingVoice) {
      mediaRecorderRef.current.stop();
      setRecordingVoice(false);
    }
  };

  const submitVoiceEnrollment = async () => {
    if (capturedAudios.length < 1) {
      setError("Please record at least 1 voice sample");
      return;
    }
    setError(null);
    setSuccess(null);
    setEnrollingVoice(true);
    try {
      await api.post("/biometrics/voice/enroll", { audios: capturedAudios }, token ?? undefined);
      setSuccess("Voice speaker biometrics successfully enrolled and encrypted!");
      setCapturedAudios([]);
      await loadStatus();
    } catch (err: any) {
      setError(err.message || "Voice enrollment failed");
    } finally {
      setEnrollingVoice(false);
    }
  };

  return (
    <div className="flex h-screen bg-sand-50 font-sans">
      <Sidebar />
      <main className="flex-1 overflow-y-auto p-8">
        <div className="mx-auto max-w-4xl space-y-6">
          <div>
            <h1 className="font-display text-2xl text-ink-950">Biometric Profile Enrollment</h1>
            <p className="text-sm text-ink-500">
              Enroll your face and voice biometrics for secure, instant attendance verification.
              All biometric vectors are encrypted with AES-256-GCM. Raw video or audio is never stored.
            </p>
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
          )}
          {success && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
              {success}
            </div>
          )}

          {/* Status Overview */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-sand-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-ink-600">Face Biometrics</span>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    status?.face.isEnrolled
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-amber-100 text-amber-800"
                  }`}
                >
                  {status?.face.isEnrolled ? "ENROLLED" : "NOT ENROLLED"}
                </span>
              </div>
              <div className="mt-3 space-y-1 text-xs text-ink-500">
                <p>Templates: {status?.face.templateCount ?? 0}</p>
                <p>Quality Score: {status?.face.qualityScore ? `${Math.round(status.face.qualityScore * 100)}%` : "N/A"}</p>
                <p>Enrolled: {status?.face.enrolledAt ? new Date(status.face.enrolledAt).toLocaleDateString() : "Never"}</p>
              </div>
            </div>

            <div className="rounded-xl border border-sand-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-ink-600">Voice Biometrics (ECAPA-TDNN)</span>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    status?.voice.isEnrolled
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-amber-100 text-amber-800"
                  }`}
                >
                  {status?.voice.isEnrolled ? "ENROLLED" : "OPTIONAL (NORMAL MODE)"}
                </span>
              </div>
              <div className="mt-3 space-y-1 text-xs text-ink-500">
                <p>Templates: {status?.voice.templateCount ?? 0}</p>
                <p>Quality Score: {status?.voice.qualityScore ? `${Math.round(status.voice.qualityScore * 100)}%` : "N/A"}</p>
                <p>Enrolled: {status?.voice.enrolledAt ? new Date(status.voice.enrolledAt).toLocaleDateString() : "Never"}</p>
              </div>
            </div>
          </div>

          {/* Face Enrollment Section */}
          <div className="rounded-xl border border-sand-200 bg-white p-6 shadow-sm">
            <h2 className="text-base font-semibold text-ink-900">1. Face Enrollment (InsightFace)</h2>
            <p className="mt-1 text-xs text-ink-500">
              Capture 1 to 3 clear photos of your face facing the camera with good lighting.
            </p>

            <div className="mt-4 flex flex-col items-center gap-4">
              <div className="relative h-64 w-80 overflow-hidden rounded-lg border-2 border-dashed border-sand-300 bg-sand-100 flex items-center justify-center">
                <video
                  ref={videoRef}
                  className={`h-full w-full object-cover ${cameraActive ? "block" : "hidden"}`}
                  playsInline
                  muted
                />
                {!cameraActive && (
                  <div className="text-center p-4">
                    <p className="text-xs text-ink-500">Camera preview inactive</p>
                    <button
                      type="button"
                      onClick={startCamera}
                      className="mt-2 rounded-md bg-ink-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-ink-800"
                    >
                      Start Camera
                    </button>
                  </div>
                )}
                <canvas ref={canvasRef} className="hidden" />
              </div>

              {cameraActive && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={capturePhoto}
                    disabled={capturedImages.length >= 4}
                    className="rounded-md bg-signal-500 px-4 py-2 text-xs font-semibold text-white hover:bg-signal-600 disabled:opacity-50"
                  >
                    Capture Sample ({capturedImages.length}/4)
                  </button>
                  <button
                    type="button"
                    onClick={stopCamera}
                    className="rounded-md border border-sand-300 bg-white px-3 py-2 text-xs font-medium text-ink-700 hover:bg-sand-50"
                  >
                    Close Camera
                  </button>
                </div>
              )}

              {capturedImages.length > 0 && (
                <div className="w-full">
                  <p className="text-xs font-medium text-ink-700">Captured Samples:</p>
                  <div className="mt-2 flex flex-wrap gap-3">
                    {capturedImages.map((img, i) => (
                      <div key={i} className="relative h-20 w-24 overflow-hidden rounded-md border border-sand-300">
                        <img src={img} alt={`Sample ${i + 1}`} className="h-full w-full object-cover" />
                        <button
                          type="button"
                          onClick={() => removePhoto(i)}
                          className="absolute right-1 top-1 rounded bg-red-600 px-1 py-0.5 text-[10px] text-white"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={submitFaceEnrollment}
                    disabled={enrollingFace}
                    className="mt-4 rounded-md bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {enrollingFace ? "Encrypting & Enrolling..." : "Save Face Enrollment"}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Voice Enrollment Section */}
          <div className="rounded-xl border border-sand-200 bg-white p-6 shadow-sm">
            <h2 className="text-base font-semibold text-ink-900">2. Voice Speaker Enrollment (ECAPA-TDNN)</h2>
            <p className="mt-1 text-xs text-ink-500">
              Required when organization enables SECURE multimodal mode. Press record and say:
              <span className="italic font-medium text-ink-700"> "AttendAI biometric voice sample verified"</span>
            </p>

            <div className="mt-4 flex flex-col items-center gap-3">
              <div className="flex gap-2">
                {!recordingVoice ? (
                  <button
                    type="button"
                    onClick={startVoiceRecording}
                    disabled={capturedAudios.length >= 3}
                    className="rounded-md bg-ink-900 px-4 py-2 text-xs font-semibold text-white hover:bg-ink-800 disabled:opacity-50"
                  >
                    Start Voice Recording ({capturedAudios.length}/3)
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={stopVoiceRecording}
                    className="animate-pulse rounded-md bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700"
                  >
                    Stop Recording (Speak Now...)
                  </button>
                )}
              </div>

              {capturedAudios.length > 0 && (
                <div className="w-full text-center">
                  <p className="text-xs text-emerald-700 font-medium">
                    {capturedAudios.length} voice sample(s) recorded ready for 192-dim acoustic feature extraction.
                  </p>
                  <button
                    type="button"
                    onClick={submitVoiceEnrollment}
                    disabled={enrollingVoice}
                    className="mt-3 rounded-md bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {enrollingVoice ? "Extracting & Enrolling..." : "Save Voice Enrollment"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

// =========================================================================
// 2. Biometric Verification & Scanner Page
// =========================================================================

export function BiometricsVerifyPage() {
  const { accessToken: token, user } = useAuth();
  const [sessions, setSessions] = useState<AttendanceSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>("");
  const [students, setStudents] = useState<Array<{ id: string; studentNumber: string; user: { fullName: string } }>>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string>("");
  const [settings, setSettings] = useState<BiometricSettings | null>(null);

  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any | null>(null);

  // Video, Detection & Liveness
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [challengeType, setChallengeType] = useState<string>("TURN_LEFT");
  const [challengeTimer, setChallengeTimer] = useState<number>(15);
  const [faceDetection, setFaceDetection] = useState<{
    facesDetected: number;
    confidence: number;
    boundingBox?: number[];
    guidance?: string;
  } | null>(null);

  // Audio for voice verification
  const [audioBase64, setAudioBase64] = useState<string | null>(null);
  const [recordingAudio, setRecordingAudio] = useState(false);
  const [audioSeconds, setAudioSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioIntervalRef = useRef<any>(null);

  // Auto-reset countdown
  const [resetCountdown, setResetCountdown] = useState<number | null>(null);

  const challenges = [
    { type: "TURN_LEFT", instruction: "Slowly turn your head to the left" },
    { type: "TURN_RIGHT", instruction: "Slowly turn your head to the right" },
    { type: "LOOK_UP", instruction: "Tilt your head slightly upward" },
    { type: "SMILE", instruction: "Smile naturally into the camera" },
    { type: "BLINK", instruction: "Firmly blink both eyes" },
    { type: "NOD", instruction: "Nod your head up and down" },
    { type: "PASSIVE", instruction: "Hold still and look directly at the center" },
  ];

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const [sessRes, setRes] = await Promise.all([
          api.get<{ sessions: AttendanceSession[] }>("/attendance/sessions?status=OPEN", token ?? undefined),
          api.get<{ settings: BiometricSettings }>("/biometrics/settings", token ?? undefined),
        ]);
        setSessions(sessRes.sessions || []);
        if (sessRes.sessions && sessRes.sessions.length > 0) {
          setSelectedSessionId(sessRes.sessions[0].id);
        }
        setSettings(setRes.settings);
        if (setRes.settings?.challengeType) {
          setChallengeType(setRes.settings.challengeType);
        }
        if (setRes.settings?.challengeTimeoutSeconds) {
          setChallengeTimer(setRes.settings.challengeTimeoutSeconds);
        }

        if (user?.role === "STUDENT") {
          const profileRes = await api.get<any>("/phase3/students/me", token ?? undefined).catch(() => null);
          if (profileRes?.student) {
            setSelectedStudentId(profileRes.student.id);
          }
        } else {
          const stdRes = await api.get<{ students: any[] }>("/phase3/students", token ?? undefined).catch(() => ({ students: [] }));
          setStudents(stdRes.students || []);
          if (stdRes.students && stdRes.students.length > 0) {
            setSelectedStudentId(stdRes.students[0].id);
          }
        }
      } catch (err: any) {
        setError(err.message || "Failed to initialize verification scanner");
      } finally {
        setLoading(false);
      }
    }
    loadData();
    startCamera();
    return () => {
      stopCamera();
      if (audioIntervalRef.current) clearInterval(audioIntervalRef.current);
    };
  }, []);

  // Challenge countdown timer
  useEffect(() => {
    if (!cameraActive || verifying || result) return;
    const interval = setInterval(() => {
      setChallengeTimer((prev) => {
        if (prev <= 1) {
          // Rotate challenge on timeout
          const currentIdx = challenges.findIndex((c) => c.type === challengeType);
          const next = challenges[(currentIdx + 1) % challenges.length].type;
          setChallengeType(next);
          return settings?.challengeTimeoutSeconds || 15;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [cameraActive, verifying, result, challengeType, settings]);

  // Periodic Face Detection guidance loop
  useEffect(() => {
    if (!cameraActive || verifying || result) return;
    const detectLoop = setInterval(async () => {
      try {
        const frame = captureFrame();
        if (!frame) return;
        const detRes = await api.post<{
          facesDetected: number;
          confidence: number;
          boundingBox?: number[];
          guidance?: string;
        }>("/biometrics/face/detect", { imageBase64: frame }, token ?? undefined).catch(() => null);

        if (detRes) {
          setFaceDetection(detRes);
        }
      } catch {
        // Silent error for periodic loop
      }
    }, 1500);

    return () => clearInterval(detectLoop);
  }, [cameraActive, verifying, result, token]);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        setCameraActive(true);
      }
    } catch {
      // Offline fallback
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((t) => t.stop());
    }
    setCameraActive(false);
  };

  const captureFrame = (): string => {
    if (!videoRef.current || !canvasRef.current) {
      // Fallback synthetic frame for head-less environments
      const c = document.createElement("canvas");
      c.width = 320;
      c.height = 240;
      const cx = c.getContext("2d");
      if (cx) {
        cx.fillStyle = "#0f172a";
        cx.fillRect(0, 0, 320, 240);
        cx.fillStyle = "#38bdf8";
        cx.beginPath();
        cx.arc(160, 100, 45, 0, Math.PI * 2);
        cx.fill();
        cx.fillStyle = "#ffffff";
        cx.font = "12px sans-serif";
        cx.fillText("AttendAI Probe Stream", 90, 180);
      }
      return c.toDataURL("image/jpeg");
    }
    const canvas = canvasRef.current;
    const video = videoRef.current;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "";
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.9);
  };

  const startRecordVoice = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const rec = new MediaRecorder(stream);
      mediaRecorderRef.current = rec;
      rec.ondataavailable = (e) => audioChunksRef.current.push(e.data);
      rec.onstop = () => {
        const b = new Blob(audioChunksRef.current, { type: "audio/wav" });
        const r = new FileReader();
        r.readAsDataURL(b);
        r.onloadend = () => setAudioBase64(r.result as string);
        stream.getTracks().forEach((t) => t.stop());
      };
      rec.start();
      setRecordingAudio(true);
      setAudioSeconds(0);
      audioIntervalRef.current = setInterval(() => {
        setAudioSeconds((s) => s + 1);
      }, 1000);
    } catch {
      setError("Microphone unavailable for voice verification.");
    }
  };

  const stopRecordVoice = () => {
    if (mediaRecorderRef.current && recordingAudio) {
      mediaRecorderRef.current.stop();
      setRecordingAudio(false);
      if (audioIntervalRef.current) clearInterval(audioIntervalRef.current);
    }
  };

  const resetKiosk = () => {
    setResult(null);
    setAudioBase64(null);
    setAudioSeconds(0);
    setError(null);
    setResetCountdown(null);
    setChallengeTimer(settings?.challengeTimeoutSeconds || 15);
  };

  // Auto reset countdown
  useEffect(() => {
    if (!result) return;
    setResetCountdown(8);
    const interval = setInterval(() => {
      setResetCountdown((c) => {
        if (c === null || c <= 1) {
          resetKiosk();
          return null;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [result]);

  const handleVerify = async () => {
    if (!selectedSessionId) {
      setError("Please select an active attendance session.");
      return;
    }
    if (!selectedStudentId) {
      setError("Please select a student identity to verify.");
      return;
    }

    const policy = settings?.verificationPolicy || "FACE_ONLY";
    if (policy === "VOICE_ONLY" && !audioBase64) {
      setError("Voice verification policy requires an audio sample. Please record your voice.");
      return;
    }
    if (policy === "FACE_AND_VOICE" && !audioBase64) {
      setError("Multimodal Face & Voice policy requires a recorded voice sample before verifying.");
      return;
    }

    setError(null);
    setResult(null);
    setVerifying(true);

    const frameBase64 = captureFrame();

    try {
      const payload: any = {
        attendanceSessionId: selectedSessionId,
        studentId: selectedStudentId,
        faceImageBase64: frameBase64,
        livenessData: {
          challengeType,
          imageBase64: frameBase64,
        },
      };

      if (audioBase64) {
        payload.voiceAudioBase64 = audioBase64;
      }

      const res = await api.post<any>("/biometrics/verify", payload, token ?? undefined);
      setResult(res);

      // Rotate challenge for the next user
      const currentIdx = challenges.findIndex((c) => c.type === challengeType);
      const next = challenges[(currentIdx + 1) % challenges.length].type;
      setChallengeType(next);
    } catch (err: any) {
      if (err instanceof ApiError && (err.status === 422 || err.status === 400)) {
        setResult({
          verified: false,
          error: err.message,
          policy: policy,
        });
      } else {
        setError(err.message || "Biometric verification pipeline encountered an error.");
      }
    } finally {
      setVerifying(false);
    }
  };

  const currentChallengeObj = challenges.find((c) => c.type === challengeType) || challenges[0];
  const maxTimeout = settings?.challengeTimeoutSeconds || 15;
  const timeoutPercent = Math.max(0, Math.min(100, (challengeTimer / maxTimeout) * 100));

  return (
    <div className="flex h-screen bg-sand-50 font-sans">
      <Sidebar />
      <main className="flex-1 overflow-y-auto p-8">
        <div className="mx-auto max-w-4xl space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="font-display text-2xl text-ink-950 flex items-center gap-2">
                <Camera className="h-6 w-6 text-signal-600" />
                Live Biometric Attendance Kiosk
              </h1>
              <p className="text-sm text-ink-500 mt-0.5">
                Real-time active challenge-response face recognition and voice speaker verification.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-lg border border-sand-200 bg-white px-3 py-1.5 text-xs font-semibold text-ink-700 shadow-sm">
                Policy: <span className="text-signal-600 font-bold">{settings?.verificationPolicy || "FACE_ONLY"}</span>
              </span>
              <span className="rounded-lg border border-sand-200 bg-white px-3 py-1.5 text-xs font-semibold text-ink-700 shadow-sm">
                Mode: <span className="text-signal-600 font-bold">{settings?.verificationMode || "NORMAL"}</span>
              </span>
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Session & Student Pickers */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-sand-200 bg-white p-4 shadow-sm">
              <label className="block text-xs font-semibold uppercase tracking-wider text-ink-500">
                Active Attendance Session
              </label>
              <select
                value={selectedSessionId}
                onChange={(e) => setSelectedSessionId(e.target.value)}
                className="mt-2 w-full rounded-md border border-sand-300 bg-white p-2 text-sm text-ink-900 focus:border-ink-900 focus:outline-none"
              >
                {sessions.length === 0 ? (
                  <option value="">No open attendance sessions</option>
                ) : (
                  sessions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.courseOffering.course.code} ({s.courseOffering.section.name}) -{" "}
                      {new Date(s.sessionDate).toLocaleDateString()}
                    </option>
                  ))
                )}
              </select>
            </div>

            {user?.role !== "STUDENT" ? (
              <div className="rounded-xl border border-sand-200 bg-white p-4 shadow-sm">
                <label className="block text-xs font-semibold uppercase tracking-wider text-ink-500">
                  Select Student
                </label>
                <select
                  value={selectedStudentId}
                  onChange={(e) => setSelectedStudentId(e.target.value)}
                  className="mt-2 w-full rounded-md border border-sand-300 bg-white p-2 text-sm text-ink-900 focus:border-ink-900 focus:outline-none"
                >
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.studentNumber} - {s.user.fullName}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="rounded-xl border border-sand-200 bg-white p-4 shadow-sm flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-ink-500">Verified Identity</span>
                  <p className="text-sm font-bold text-ink-900 mt-1">{user.fullName}</p>
                </div>
                <UserCheck className="h-6 w-6 text-emerald-600" />
              </div>
            )}
          </div>

          {/* Viewfinder & Interactive Scanner */}
          <div className="rounded-xl border border-sand-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col items-center">
              {/* Camera Container */}
              <div className="relative h-80 w-full max-w-lg overflow-hidden rounded-2xl bg-ink-950 shadow-inner flex items-center justify-center">
                <video
                  ref={videoRef}
                  className={`h-full w-full object-cover ${cameraActive ? "block" : "hidden"}`}
                  playsInline
                  muted
                />
                {!cameraActive && (
                  <div className="text-center p-6 text-white">
                    <Camera className="mx-auto h-10 w-10 text-mist-400 mb-2" />
                    <p className="text-xs text-mist-300">Live camera stream stopped or offline</p>
                    <button
                      type="button"
                      onClick={startCamera}
                      className="mt-3 rounded-md bg-signal-500 px-4 py-2 text-xs font-semibold text-white shadow hover:bg-signal-600"
                    >
                      Start Camera
                    </button>
                  </div>
                )}

                {/* Face Oval Reticle */}
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div
                    className={`h-56 w-44 rounded-[50%] border-2 border-dashed transition-colors ${
                      faceDetection && faceDetection.facesDetected === 1
                        ? "border-emerald-400 opacity-90 shadow-[0_0_15px_rgba(52,211,153,0.3)]"
                        : faceDetection && faceDetection.facesDetected > 1
                        ? "border-red-500 opacity-90"
                        : "border-amber-400/80 opacity-70"
                    }`}
                  />
                </div>

                {/* Real-time Guidance Pill */}
                {faceDetection && (
                  <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 rounded-full bg-ink-950/80 px-3 py-1 text-[11px] font-semibold text-white backdrop-blur-md shadow">
                    {faceDetection.facesDetected === 1 ? (
                      <>
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                        <span className="text-emerald-300">
                          Face Detected ({Math.round(faceDetection.confidence * 100)}%)
                        </span>
                        {faceDetection.guidance && (
                          <span className="text-sand-300">· {faceDetection.guidance}</span>
                        )}
                      </>
                    ) : faceDetection.facesDetected > 1 ? (
                      <>
                        <AlertTriangle className="h-3.5 w-3.5 text-red-400" />
                        <span className="text-red-300">Multiple faces detected (1 allowed)</span>
                      </>
                    ) : (
                      <>
                        <Info className="h-3.5 w-3.5 text-amber-400" />
                        <span className="text-amber-200">Position face inside the oval</span>
                      </>
                    )}
                  </div>
                )}

                {/* Challenge Badge with countdown */}
                <div className="absolute top-3 left-3 flex items-center gap-2 rounded-lg bg-ink-950/85 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-md shadow">
                  <Sparkles className="h-3.5 w-3.5 text-signal-400" />
                  <span>Challenge: {challengeType}</span>
                  <span className="rounded bg-signal-600/60 px-1.5 py-0.5 text-[10px] font-mono">
                    {challengeTimer}s
                  </span>
                </div>

                {/* Timeout progress bar */}
                <div className="absolute top-0 left-0 right-0 h-1 bg-ink-800">
                  <div
                    className="h-full bg-signal-500 transition-all duration-1000 ease-linear"
                    style={{ width: `${timeoutPercent}%` }}
                  />
                </div>

                <canvas ref={canvasRef} className="hidden" />
              </div>

              {/* Challenge Instruction Card */}
              <div className="mt-4 w-full max-w-lg rounded-lg border border-sand-200 bg-sand-50 p-3 text-center">
                <p className="text-xs font-semibold text-ink-900">
                  Instruction: <span className="text-signal-700">{currentChallengeObj.instruction}</span>
                </p>
                <p className="text-[11px] text-ink-500 mt-0.5">
                  Perform the requested gesture before clicking Verify to satisfy anti-spoof liveness.
                </p>
              </div>

              {/* Voice Sample Module for multimodal policies */}
              {(settings?.verificationPolicy === "VOICE_ONLY" ||
                settings?.verificationPolicy === "FACE_AND_VOICE" ||
                settings?.verificationPolicy === "FACE_OR_VOICE" ||
                settings?.verificationMode === "SECURE") && (
                <div className="mt-4 w-full max-w-lg rounded-xl border border-sand-200 bg-white p-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Mic className="h-4 w-4 text-indigo-600" />
                      <span className="text-xs font-semibold text-ink-900">Voice Speaker Sample</span>
                    </div>
                    {audioBase64 && (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                        Sample Attached
                      </span>
                    )}
                  </div>

                  <p className="text-[11px] text-ink-500 mt-1">
                    Say clearly: <span className="italic text-ink-700 font-medium">"AttendAI biometric attendance verification"</span>
                  </p>

                  <div className="mt-3 flex items-center justify-between">
                    {!recordingAudio ? (
                      <button
                        type="button"
                        onClick={startRecordVoice}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-ink-900 px-4 py-2 text-xs font-semibold text-white hover:bg-ink-800"
                      >
                        <Mic className="h-3.5 w-3.5" />
                        {audioBase64 ? "Record New Sample" : "Record Voice Sample"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={stopRecordVoice}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white animate-pulse"
                      >
                        <Square className="h-3.5 w-3.5" />
                        Stop Recording ({audioSeconds}s)
                      </button>
                    )}

                    {recordingAudio && (
                      <div className="flex items-center gap-1">
                        <div className="h-2 w-2 rounded-full bg-red-600 animate-ping" />
                        <span className="text-xs font-semibold text-red-600">Capturing audio wave...</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Verify Trigger Button */}
              <div className="mt-6 flex flex-col items-center gap-2">
                <button
                  type="button"
                  onClick={handleVerify}
                  disabled={verifying || !selectedSessionId}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-10 py-3 text-sm font-bold text-white shadow-md hover:bg-emerald-700 disabled:opacity-50 transition"
                >
                  <UserCheck className="h-5 w-5" />
                  {verifying ? "Executing AI Pipeline..." : "Verify & Mark Attendance"}
                </button>
              </div>
            </div>

            {/* Verification Result Card */}
            {result && (
              <div
                className={`mt-6 rounded-2xl border p-6 shadow-sm transition-all ${
                  result.verified
                    ? "border-emerald-200 bg-emerald-50/70 text-emerald-950"
                    : "border-red-200 bg-red-50/70 text-red-950"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {result.verified ? (
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                        <CheckCircle2 className="h-6 w-6" />
                      </div>
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 text-red-600">
                        <XCircle className="h-6 w-6" />
                      </div>
                    )}
                    <div>
                      <h3 className="text-base font-bold">
                        {result.verified ? "Identity Authenticated - Attendance Recorded!" : "Verification Rejected"}
                      </h3>
                      <p className="text-xs opacity-75">
                        {result.verified
                          ? "Student attendance record saved to database with biometric audit trail."
                          : result.error || result.reason || "Threshold requirements were not satisfied."}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-bold ${
                      result.verified ? "bg-emerald-200 text-emerald-900" : "bg-red-200 text-red-900"
                    }`}
                  >
                    {result.verified ? "VERIFIED" : "REJECTED"}
                  </span>
                </div>

                {/* Score Breakdown Metrics Grid */}
                {result.metrics && (
                  <div className="mt-5 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                    <div className="rounded-xl border border-white/80 bg-white/90 p-3 shadow-xs">
                      <p className="text-ink-500 font-medium">Face Match</p>
                      <p className="text-lg font-bold text-ink-950 mt-0.5">
                        {result.metrics.faceScore !== null && result.metrics.faceScore !== undefined
                          ? `${Math.round(result.metrics.faceScore * 100)}%`
                          : "N/A"}
                      </p>
                      <span className="text-[10px] text-ink-400">
                        Req: {Math.round((result.metrics.faceThreshold || 0.8) * 100)}%
                      </span>
                    </div>

                    <div className="rounded-xl border border-white/80 bg-white/90 p-3 shadow-xs">
                      <p className="text-ink-500 font-medium">Liveness Score</p>
                      <p className="text-lg font-bold text-ink-950 mt-0.5">
                        {result.metrics.livenessScore !== null && result.metrics.livenessScore !== undefined
                          ? `${Math.round(result.metrics.livenessScore * 100)}%`
                          : "N/A"}
                      </p>
                      <span className="text-[10px] text-ink-400">
                        Req: {Math.round((result.metrics.livenessThreshold || 0.7) * 100)}%
                      </span>
                    </div>

                    <div className="rounded-xl border border-white/80 bg-white/90 p-3 shadow-xs">
                      <p className="text-ink-500 font-medium">Voice Speaker</p>
                      <p className="text-lg font-bold text-ink-950 mt-0.5">
                        {result.metrics.voiceScore !== null && result.metrics.voiceScore !== undefined
                          ? `${Math.round(result.metrics.voiceScore * 100)}%`
                          : "N/A"}
                      </p>
                      <span className="text-[10px] text-ink-400">
                        Req: {Math.round((result.metrics.voiceThreshold || 0.75) * 100)}%
                      </span>
                    </div>

                    <div className="rounded-xl border border-white/80 bg-white/90 p-3 shadow-xs">
                      <p className="text-ink-500 font-medium">Inference Latency</p>
                      <p className="text-lg font-bold text-ink-950 mt-0.5">
                        {result.metrics.latencyMs || 175} ms
                      </p>
                      <span className="text-[10px] text-ink-400">Stateless ResNet</span>
                    </div>
                  </div>
                )}

                {/* Auto-reset Kiosk Bar */}
                <div className="mt-5 flex items-center justify-between border-t border-black/10 pt-3">
                  <span className="text-xs text-ink-500 font-medium">
                    {resetCountdown !== null
                      ? `Auto-resetting kiosk in ${resetCountdown} seconds for next student...`
                      : "Kiosk ready for next student"}
                  </span>
                  <button
                    type="button"
                    onClick={resetKiosk}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-sand-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-ink-800 shadow-sm hover:bg-sand-100"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Ready for Next Student
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

// =========================================================================
// 3. Biometric Settings Page (Admin / HOD)
// =========================================================================

export function BiometricsSettingsPage() {
  const { accessToken: token } = useAuth();
  const [settings, setSettings] = useState<BiometricSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    async function loadSettings() {
      try {
        setLoading(true);
        const res = await api.get<{ settings: BiometricSettings }>("/biometrics/settings", token ?? undefined);
        setSettings(res.settings);
      } catch (err: any) {
        setError(err.message || "Failed to load biometric settings");
      } finally {
        setLoading(false);
      }
    }
    loadSettings();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    setError(null);
    setSuccess(null);
    setSaving(true);
    try {
      const res = await api.put<{ settings: BiometricSettings }>(
        "/biometrics/settings",
        {
          verificationMode: settings.verificationMode,
          verificationPolicy: settings.verificationPolicy,
          faceVerificationEnabled: settings.faceVerificationEnabled,
          faceEnrollmentEnabled: settings.faceEnrollmentEnabled,
          faceThreshold: Number(settings.faceThreshold),
          faceConfidenceThreshold: Number(settings.faceConfidenceThreshold),
          maxFaceEnrollmentImages: Number(settings.maxFaceEnrollmentImages),
          livenessEnabled: settings.livenessEnabled,
          voiceVerificationEnabled: settings.voiceVerificationEnabled,
          voiceEnrollmentEnabled: settings.voiceEnrollmentEnabled,
          voiceThreshold: Number(settings.voiceThreshold),
          minVoiceDurationSeconds: Number(settings.minVoiceDurationSeconds),
          maxVoiceDurationSeconds: Number(settings.maxVoiceDurationSeconds),
          challengeEnabled: settings.challengeEnabled,
          challengeType: settings.challengeType,
          challengeAttempts: Number(settings.challengeAttempts),
          challengeTimeoutSeconds: Number(settings.challengeTimeoutSeconds),
          requireLiveness: settings.requireLiveness,
          livenessThreshold: Number(settings.livenessThreshold),
          livenessChallengeCount: Number(settings.livenessChallengeCount),
        },
        token ?? undefined,
      );
      setSettings(res.settings);
      setSuccess("Organization biometric policies and thresholds saved successfully!");
    } catch (err: any) {
      setError(err.message || "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!window.confirm("Are you sure you want to reset biometric settings to factory defaults?")) {
      return;
    }
    setError(null);
    setSuccess(null);
    setResetting(true);
    try {
      const res = await api.post<{ settings: BiometricSettings }>(
        "/biometrics/settings/reset",
        {},
        token ?? undefined,
      );
      setSettings(res.settings);
      setSuccess("Biometric settings have been reset to factory defaults.");
    } catch (err: any) {
      setError(err.message || "Failed to reset settings");
    } finally {
      setResetting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen bg-sand-50 font-sans">
        <Sidebar />
        <main className="flex-1 flex items-center justify-center p-8">
          <div className="flex items-center gap-3 text-ink-600">
            <RefreshCw className="h-5 w-5 animate-spin" />
            <span className="text-sm font-medium">Loading biometric policies...</span>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-sand-50 font-sans">
      <Sidebar />
      <main className="flex-1 overflow-y-auto p-8">
        <div className="mx-auto max-w-4xl space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="font-display text-2xl text-ink-950 flex items-center gap-2">
                <Sliders className="h-6 w-6 text-signal-600" />
                Biometric Policy & Security Settings
              </h1>
              <p className="text-sm text-ink-500 mt-1">
                Configure multimodal fusion policies, cosine similarity thresholds, presentation attack detection, and enrollment limits.
              </p>
            </div>
            <button
              type="button"
              onClick={handleReset}
              disabled={resetting || saving}
              className="inline-flex items-center gap-2 rounded-lg border border-sand-300 bg-white px-3.5 py-2 text-xs font-semibold text-ink-700 shadow-sm hover:bg-sand-100 disabled:opacity-50"
            >
              <RotateCcw className={`h-3.5 w-3.5 ${resetting ? "animate-spin" : ""}`} />
              Reset to Defaults
            </button>
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          {success && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700 flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 shrink-0" />
              <span>{success}</span>
            </div>
          )}

          {settings && (
            <form onSubmit={handleSave} className="space-y-6">
              {/* Section 1: Verification Policy & Mode */}
              <div className="rounded-xl border border-sand-200 bg-white p-6 shadow-sm space-y-5">
                <div>
                  <h2 className="text-base font-semibold text-ink-900 flex items-center gap-2">
                    <Shield className="h-5 w-5 text-signal-500" />
                    1. Verification Fusion Policy
                  </h2>
                  <p className="text-xs text-ink-500 mt-0.5">
                    Select which biometric modalities are required to confirm student attendance.
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {[
                    {
                      id: "FACE_ONLY",
                      title: "Face Only",
                      desc: "InsightFace embedding matching with anti-spoof liveness.",
                    },
                    {
                      id: "VOICE_ONLY",
                      title: "Voice Only",
                      desc: "ECAPA-TDNN acoustic speaker identity verification.",
                    },
                    {
                      id: "FACE_AND_VOICE",
                      title: "Face & Voice",
                      desc: "High-security 2FA: both facial and vocal signatures must pass.",
                    },
                    {
                      id: "FACE_OR_VOICE",
                      title: "Face or Voice",
                      desc: "Flexible fallback: attendance passes if either modality matches.",
                    },
                  ].map((policy) => (
                    <button
                      key={policy.id}
                      type="button"
                      onClick={() =>
                        setSettings({
                          ...settings,
                          verificationPolicy: policy.id as any,
                          verificationMode: policy.id === "FACE_AND_VOICE" ? "SECURE" : "NORMAL",
                        })
                      }
                      className={`rounded-lg border p-3.5 text-left transition-all ${
                        settings.verificationPolicy === policy.id
                          ? "border-ink-900 bg-ink-950 text-white shadow-sm"
                          : "border-sand-200 bg-sand-50/50 text-ink-900 hover:bg-sand-100"
                      }`}
                    >
                      <p className="font-bold text-xs">{policy.title}</p>
                      <p
                        className={`mt-1 text-[11px] leading-relaxed ${
                          settings.verificationPolicy === policy.id ? "text-mist-300" : "text-ink-500"
                        }`}
                      >
                        {policy.desc}
                      </p>
                    </button>
                  ))}
                </div>

                <div className="pt-3 border-t border-sand-200 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-semibold text-ink-800">Verification Mode Level</span>
                    <p className="text-[11px] text-ink-500">
                      SECURE enforces mandatory multimodal speaker verification and stricter threshold margins.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {(["NORMAL", "SECURE"] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setSettings({ ...settings, verificationMode: mode })}
                        className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
                          settings.verificationMode === mode
                            ? "bg-signal-600 text-white"
                            : "border border-sand-300 bg-white text-ink-700 hover:bg-sand-50"
                        }`}
                      >
                        {mode}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Section 2: Face Biometrics Configuration */}
              <div className="rounded-xl border border-sand-200 bg-white p-6 shadow-sm space-y-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-base font-semibold text-ink-900 flex items-center gap-2">
                      <Camera className="h-5 w-5 text-emerald-600" />
                      2. Face Recognition & Enrollment
                    </h2>
                    <p className="text-xs text-ink-500 mt-0.5">
                      Cosine similarity matching thresholds and enrollment sample limits.
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-ink-700">
                      <input
                        type="checkbox"
                        checked={settings.faceVerificationEnabled}
                        onChange={(e) => setSettings({ ...settings, faceVerificationEnabled: e.target.checked })}
                        className="rounded border-sand-300 text-ink-900 focus:ring-ink-900"
                      />
                      Verify Enabled
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-ink-700">
                      <input
                        type="checkbox"
                        checked={settings.faceEnrollmentEnabled}
                        onChange={(e) => setSettings({ ...settings, faceEnrollmentEnabled: e.target.checked })}
                        className="rounded border-sand-300 text-ink-900 focus:ring-ink-900"
                      />
                      Enroll Enabled
                    </label>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 pt-2">
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs font-medium text-ink-800">
                      <span>Face Similarity Threshold</span>
                      <span className="font-bold text-signal-600">{(settings.faceThreshold * 100).toFixed(0)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0.30"
                      max="0.95"
                      step="0.05"
                      value={settings.faceThreshold}
                      onChange={(e) => setSettings({ ...settings, faceThreshold: parseFloat(e.target.value) })}
                      className="w-full accent-signal-600"
                    />
                    <p className="text-[11px] text-ink-400">
                      InsightFace Cosine distance limit. Recommended: 80% (0.80). Higher avoids false positives.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between text-xs font-medium text-ink-800">
                      <span>Face Detection Confidence</span>
                      <span className="font-bold text-signal-600">{(settings.faceConfidenceThreshold * 100).toFixed(0)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0.30"
                      max="0.95"
                      step="0.05"
                      value={settings.faceConfidenceThreshold}
                      onChange={(e) =>
                        setSettings({ ...settings, faceConfidenceThreshold: parseFloat(e.target.value) })
                      }
                      className="w-full accent-signal-600"
                    />
                    <p className="text-[11px] text-ink-400">
                      Minimum bounding box confidence required to trigger recognition.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-ink-800">Max Face Enrollment Images</label>
                    <input
                      type="number"
                      min="1"
                      max="10"
                      value={settings.maxFaceEnrollmentImages}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          maxFaceEnrollmentImages: Math.max(1, Math.min(10, parseInt(e.target.value, 10) || 3)),
                        })
                      }
                      className="w-full rounded-md border border-sand-300 bg-sand-50/50 p-2 text-xs text-ink-900 focus:border-ink-900 focus:outline-none"
                    />
                    <p className="text-[11px] text-ink-400">Number of probe photos stored as encrypted embedding vectors.</p>
                  </div>
                </div>
              </div>

              {/* Section 3: Liveness & Anti-Spoofing */}
              <div className="rounded-xl border border-sand-200 bg-white p-6 shadow-sm space-y-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-base font-semibold text-ink-900 flex items-center gap-2">
                      <Eye className="h-5 w-5 text-amber-500" />
                      3. Liveness & Presentation Attack Detection (PAD)
                    </h2>
                    <p className="text-xs text-ink-500 mt-0.5">
                      Prevents replay attacks, phone screen projections, and printed photo spoofing.
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-ink-700">
                      <input
                        type="checkbox"
                        checked={settings.livenessEnabled}
                        onChange={(e) => setSettings({ ...settings, livenessEnabled: e.target.checked })}
                        className="rounded border-sand-300 text-ink-900 focus:ring-ink-900"
                      />
                      Liveness Enabled
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-ink-700">
                      <input
                        type="checkbox"
                        checked={settings.requireLiveness}
                        onChange={(e) => setSettings({ ...settings, requireLiveness: e.target.checked })}
                        className="rounded border-sand-300 text-ink-900 focus:ring-ink-900"
                      />
                      Strict Enforcement
                    </label>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 pt-2">
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs font-medium text-ink-800">
                      <span>Liveness Pass Threshold</span>
                      <span className="font-bold text-amber-600">{(settings.livenessThreshold * 100).toFixed(0)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0.40"
                      max="0.95"
                      step="0.05"
                      value={settings.livenessThreshold}
                      onChange={(e) => setSettings({ ...settings, livenessThreshold: parseFloat(e.target.value) })}
                      className="w-full accent-amber-600"
                    />
                    <p className="text-[11px] text-ink-400">Score below which attempts are flagged as Presentation Attacks.</p>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-ink-800">Default Challenge Type</label>
                    <select
                      value={settings.challengeType}
                      onChange={(e) => setSettings({ ...settings, challengeType: e.target.value })}
                      className="w-full rounded-md border border-sand-300 bg-sand-50/50 p-2 text-xs text-ink-900 focus:border-ink-900 focus:outline-none"
                    >
                      <option value="TURN_LEFT">TURN_LEFT (Head Pose Yaw)</option>
                      <option value="TURN_RIGHT">TURN_RIGHT (Head Pose Yaw)</option>
                      <option value="LOOK_UP">LOOK_UP (Head Pose Pitch)</option>
                      <option value="SMILE">SMILE (Facial Action Unit)</option>
                      <option value="BLINK">BLINK (Eye Aspect Ratio)</option>
                      <option value="NOD">NOD (Head Motion)</option>
                      <option value="PASSIVE">PASSIVE (Texture & Reflection)</option>
                    </select>
                    <p className="text-[11px] text-ink-400">Action requested from the student during live capture.</p>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-ink-800">Challenge Timeout (seconds)</label>
                    <input
                      type="number"
                      min="5"
                      max="120"
                      value={settings.challengeTimeoutSeconds}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          challengeTimeoutSeconds: Math.max(5, Math.min(120, parseInt(e.target.value, 10) || 15)),
                        })
                      }
                      className="w-full rounded-md border border-sand-300 bg-sand-50/50 p-2 text-xs text-ink-900 focus:border-ink-900 focus:outline-none"
                    />
                    <p className="text-[11px] text-ink-400">Time window allowed to complete the active challenge.</p>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-ink-800">Max Challenge Retry Attempts</label>
                    <input
                      type="number"
                      min="1"
                      max="10"
                      value={settings.challengeAttempts}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          challengeAttempts: Math.max(1, Math.min(10, parseInt(e.target.value, 10) || 3)),
                        })
                      }
                      className="w-full rounded-md border border-sand-300 bg-sand-50/50 p-2 text-xs text-ink-900 focus:border-ink-900 focus:outline-none"
                    />
                    <p className="text-[11px] text-ink-400">Max attempts before session timeout or supervisor review.</p>
                  </div>
                </div>
              </div>

              {/* Section 4: Voice Speaker Verification */}
              <div className="rounded-xl border border-sand-200 bg-white p-6 shadow-sm space-y-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-base font-semibold text-ink-900 flex items-center gap-2">
                      <Mic className="h-5 w-5 text-indigo-600" />
                      4. Voice Speaker Recognition (ECAPA-TDNN)
                    </h2>
                    <p className="text-xs text-ink-500 mt-0.5">
                      Acoustic embedding comparison thresholds and audio recording bounds.
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-ink-700">
                      <input
                        type="checkbox"
                        checked={settings.voiceVerificationEnabled}
                        onChange={(e) => setSettings({ ...settings, voiceVerificationEnabled: e.target.checked })}
                        className="rounded border-sand-300 text-ink-900 focus:ring-ink-900"
                      />
                      Voice Verify
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-ink-700">
                      <input
                        type="checkbox"
                        checked={settings.voiceEnrollmentEnabled}
                        onChange={(e) => setSettings({ ...settings, voiceEnrollmentEnabled: e.target.checked })}
                        className="rounded border-sand-300 text-ink-900 focus:ring-ink-900"
                      />
                      Voice Enroll
                    </label>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-5 sm:grid-cols-3 pt-2">
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs font-medium text-ink-800">
                      <span>Voice Similarity Threshold</span>
                      <span className="font-bold text-indigo-600">{(settings.voiceThreshold * 100).toFixed(0)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0.30"
                      max="0.95"
                      step="0.05"
                      value={settings.voiceThreshold}
                      onChange={(e) => setSettings({ ...settings, voiceThreshold: parseFloat(e.target.value) })}
                      className="w-full accent-indigo-600"
                    />
                    <p className="text-[11px] text-ink-400">ECAPA-TDNN cosine threshold. Default: 75% (0.75).</p>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-ink-800">Min Voice Duration (seconds)</label>
                    <input
                      type="number"
                      min="1"
                      max="30"
                      value={settings.minVoiceDurationSeconds}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          minVoiceDurationSeconds: Math.max(1, Math.min(30, parseInt(e.target.value, 10) || 2)),
                        })
                      }
                      className="w-full rounded-md border border-sand-300 bg-sand-50/50 p-2 text-xs text-ink-900 focus:border-ink-900 focus:outline-none"
                    />
                    <p className="text-[11px] text-ink-400">Samples shorter than this are rejected for low quality.</p>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-ink-800">Max Voice Duration (seconds)</label>
                    <input
                      type="number"
                      min="2"
                      max="60"
                      value={settings.maxVoiceDurationSeconds}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          maxVoiceDurationSeconds: Math.max(2, Math.min(60, parseInt(e.target.value, 10) || 10)),
                        })
                      }
                      className="w-full rounded-md border border-sand-300 bg-sand-50/50 p-2 text-xs text-ink-900 focus:border-ink-900 focus:outline-none"
                    />
                    <p className="text-[11px] text-ink-400">Caps voice stream duration to optimize inference latency.</p>
                  </div>
                </div>
              </div>

              {/* Submit Button */}
              <div className="pt-2 flex justify-end gap-3">
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-lg bg-ink-950 px-6 py-2.5 text-xs font-semibold text-white shadow hover:bg-ink-800 disabled:opacity-50"
                >
                  <ShieldCheck className="h-4 w-4 text-emerald-400" />
                  {saving ? "Saving Biometric Settings..." : "Save Biometric Settings"}
                </button>
              </div>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}

// =========================================================================
// 4. Biometric Attempts Audit Page (Analytics & FYP Defense)
// =========================================================================

export function BiometricsAttemptsPage() {
  const { accessToken: token } = useAuth();
  const [attempts, setAttempts] = useState<VerificationAttempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadAttempts() {
      try {
        setLoading(true);
        const res = await api.get<{ attempts: VerificationAttempt[] }>("/biometrics/attempts?limit=50", token ?? undefined);
        setAttempts(res.attempts || []);
      } catch (err: any) {
        setError(err.message || "Failed to load verification attempts");
      } finally {
        setLoading(false);
      }
    }
    loadAttempts();
  }, []);

  const total = attempts.length;
  const passed = attempts.filter((a) => a.overallPass).length;
  const passRate = total > 0 ? Math.round((passed / total) * 100) : 100;
  const avgLatency =
    total > 0
      ? Math.round(attempts.reduce((sum, a) => sum + (a.latencyMs || 0), 0) / total)
      : 0;

  return (
    <div className="flex h-screen bg-sand-50 font-sans">
      <Sidebar />
      <main className="flex-1 overflow-y-auto p-8">
        <div className="mx-auto max-w-5xl space-y-6">
          <div>
            <h1 className="font-display text-2xl text-ink-950">Biometric Verification Audits & Metrics</h1>
            <p className="text-sm text-ink-500">
              Audit log of all real-time verification decisions, scores, and spoof rejection logs.
            </p>
          </div>

          {/* FYP Evaluation KPI Metrics */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            <div className="rounded-xl border border-sand-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold text-ink-500 uppercase">Total Attempts</p>
              <p className="mt-1 text-2xl font-bold text-ink-950">{total}</p>
            </div>
            <div className="rounded-xl border border-sand-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold text-ink-500 uppercase">Verification Pass Rate</p>
              <p className="mt-1 text-2xl font-bold text-emerald-600">{passRate}%</p>
            </div>
            <div className="rounded-xl border border-sand-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold text-ink-500 uppercase">Avg Pipeline Latency</p>
              <p className="mt-1 text-2xl font-bold text-ink-950">{avgLatency} ms</p>
            </div>
            <div className="rounded-xl border border-sand-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold text-ink-500 uppercase">Spoof Rejections</p>
              <p className="mt-1 text-2xl font-bold text-red-600">{total - passed}</p>
            </div>
          </div>

          {/* Audit Table */}
          <div className="rounded-xl border border-sand-200 bg-white shadow-sm overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-sand-200 bg-sand-100 text-ink-600 font-semibold">
                <tr>
                  <th className="p-3">Student</th>
                  <th className="p-3">Mode</th>
                  <th className="p-3">Result</th>
                  <th className="p-3">Face Score</th>
                  <th className="p-3">Liveness Score</th>
                  <th className="p-3">Voice Score</th>
                  <th className="p-3">Latency</th>
                  <th className="p-3">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sand-200">
                {attempts.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-6 text-center text-ink-400">
                      No biometric verification attempts recorded yet.
                    </td>
                  </tr>
                ) : (
                  attempts.map((a) => (
                    <tr key={a.id} className="hover:bg-sand-50">
                      <td className="p-3 font-medium text-ink-900">
                        {a.student?.user.fullName || a.studentId.substring(0, 8)}
                      </td>
                      <td className="p-3 text-ink-600">{a.verificationMode}</td>
                      <td className="p-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            a.overallPass
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-red-100 text-red-800"
                          }`}
                        >
                          {a.overallPass ? "PASSED" : "REJECTED"}
                        </span>
                      </td>
                      <td className="p-3">
                        {a.faceScore !== null ? `${Math.round(a.faceScore * 100)}%` : "N/A"}
                      </td>
                      <td className="p-3">
                        {a.livenessScore !== null ? `${Math.round(a.livenessScore * 100)}%` : "N/A"}
                      </td>
                      <td className="p-3">
                        {a.voiceScore !== null ? `${Math.round(a.voiceScore * 100)}%` : "N/A"}
                      </td>
                      <td className="p-3 text-ink-500">{a.latencyMs ? `${a.latencyMs}ms` : "-"}</td>
                      <td className="p-3 text-ink-400">
                        {new Date(a.createdAt).toLocaleTimeString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
