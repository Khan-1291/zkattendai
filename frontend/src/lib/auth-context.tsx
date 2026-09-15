import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { api } from "./api";

export type Role = "SUPER_ADMIN" | "ORG_ADMIN" | "HOD" | "TEACHER" | "STUDENT";

export interface SessionUser {
  id: string;
  fullName: string;
  email: string;
  role: Role;
  organizationId: string | null;
  organization: { id: string; name: string; slug: string; status: string } | null;
}

interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: SessionUser;
}

interface AuthContextValue {
  user: SessionUser | null;
  accessToken: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (input: {
    organizationName: string;
    adminFullName: string;
    adminEmail: string;
    adminPassword: string;
  }) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const STORAGE_KEY = "attendai.session";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as { accessToken: string; user: SessionUser };
        setAccessToken(parsed.accessToken);
        setUser(parsed.user);
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
    setIsLoading(false);
  }, []);

  function persist(result: AuthResponse) {
    setAccessToken(result.accessToken);
    setUser(result.user);
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ accessToken: result.accessToken, user: result.user })
    );
  }

  async function login(email: string, password: string) {
    const result = await api.post<AuthResponse>("/auth/login", { email, password });
    persist(result);
  }

  async function signup(input: {
    organizationName: string;
    adminFullName: string;
    adminEmail: string;
    adminPassword: string;
  }) {
    const result = await api.post<AuthResponse>("/auth/signup", input);
    persist(result);
  }

  function logout() {
    setAccessToken(null);
    setUser(null);
    localStorage.removeItem(STORAGE_KEY);
  }

  return (
    <AuthContext.Provider value={{ user, accessToken, isLoading, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
