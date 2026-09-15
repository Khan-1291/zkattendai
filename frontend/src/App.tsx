import { Routes, Route } from "react-router-dom";
import { Landing } from "./routes/Landing";
import { Login } from "./routes/Login";
import { Signup } from "./routes/Signup";
import { DashboardShell } from "./routes/DashboardShell";
import { ProtectedRoute } from "./components/ProtectedRoute";
import {
  DepartmentsPage,
  ProgramsPage,
  TermsPage,
  SemestersPage,
  SectionsPage,
} from "./routes/Academic";
import {
  StudentsPage,
  TeachersPage,
  CoursesPage,
  OfferingsPage,
  EnrollmentsPage,
  MyTeacherOfferingsPage,
  MyStudentEnrollmentsPage,
} from "./routes/Phase3";
import { AttendancePage, StudentAttendancePage } from "./routes/Attendance";
import {
  BiometricsEnrollPage,
  BiometricsVerifyPage,
  BiometricsSettingsPage,
  BiometricsAttemptsPage,
} from "./routes/Biometrics";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route
        path="/app"
        element={
          <ProtectedRoute>
            <DashboardShell />
          </ProtectedRoute>
        }
      />
      <Route path="/app/departments" element={<ProtectedRoute allow={["ORG_ADMIN", "HOD"]}><DepartmentsPage /></ProtectedRoute>} />
      <Route path="/app/programs" element={<ProtectedRoute allow={["ORG_ADMIN", "HOD"]}><ProgramsPage /></ProtectedRoute>} />
      <Route path="/app/terms" element={<ProtectedRoute allow={["ORG_ADMIN", "HOD"]}><TermsPage /></ProtectedRoute>} />
      <Route path="/app/semesters" element={<ProtectedRoute allow={["ORG_ADMIN", "HOD"]}><SemestersPage /></ProtectedRoute>} />
      <Route path="/app/sections" element={<ProtectedRoute allow={["ORG_ADMIN", "HOD"]}><SectionsPage /></ProtectedRoute>} />
      <Route path="/app/students" element={<ProtectedRoute allow={["ORG_ADMIN", "HOD"]}><StudentsPage /></ProtectedRoute>} />
      <Route path="/app/teachers" element={<ProtectedRoute allow={["ORG_ADMIN", "HOD"]}><TeachersPage /></ProtectedRoute>} />
      <Route path="/app/courses" element={<ProtectedRoute allow={["ORG_ADMIN", "HOD"]}><CoursesPage /></ProtectedRoute>} />
      <Route path="/app/offerings" element={<ProtectedRoute allow={["ORG_ADMIN", "HOD"]}><OfferingsPage /></ProtectedRoute>} />
      <Route path="/app/enrollments" element={<ProtectedRoute allow={["ORG_ADMIN", "HOD"]}><EnrollmentsPage /></ProtectedRoute>} />
      <Route path="/app/my-offerings" element={<ProtectedRoute allow={["TEACHER"]}><MyTeacherOfferingsPage /></ProtectedRoute>} />
      <Route path="/app/my-enrollments" element={<ProtectedRoute allow={["STUDENT"]}><MyStudentEnrollmentsPage /></ProtectedRoute>} />
      <Route path="/app/attendance" element={<ProtectedRoute allow={["ORG_ADMIN", "HOD", "TEACHER"]}><AttendancePage /></ProtectedRoute>} />
      <Route path="/app/attendance-history" element={<ProtectedRoute allow={["ORG_ADMIN", "HOD", "TEACHER"]}><AttendancePage /></ProtectedRoute>} />
      <Route path="/app/my-attendance" element={<ProtectedRoute allow={["STUDENT"]}><StudentAttendancePage /></ProtectedRoute>} />
      <Route path="/app/biometrics/enroll" element={<ProtectedRoute><BiometricsEnrollPage /></ProtectedRoute>} />
      <Route path="/app/biometrics/verify" element={<ProtectedRoute><BiometricsVerifyPage /></ProtectedRoute>} />
      <Route path="/app/biometrics/settings" element={<ProtectedRoute allow={["ORG_ADMIN", "HOD"]}><BiometricsSettingsPage /></ProtectedRoute>} />
      <Route path="/app/biometrics/attempts" element={<ProtectedRoute allow={["ORG_ADMIN", "HOD", "TEACHER"]}><BiometricsAttemptsPage /></ProtectedRoute>} />
    </Routes>
  );
}
