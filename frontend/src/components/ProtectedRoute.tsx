import { Navigate } from "react-router-dom";
import { ReactNode } from "react";
import { useAuth, Role } from "../lib/auth-context";

export function ProtectedRoute({
  children,
  allow,
}: {
  children: ReactNode;
  allow?: Role[];
}) {
  const { user, isLoading } = useAuth();

  if (isLoading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (allow && !allow.includes(user.role)) return <Navigate to="/app" replace />;

  return <>{children}</>;
}
