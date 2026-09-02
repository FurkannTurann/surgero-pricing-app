import React, { useState } from "react";
import { useAppContext } from "../context/AppContext";
import { User } from "../types/entities";
import { Input } from "../components/Input";
import Card from "../components/Card";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth, db } from "../services/firebase";
import { doc, getDoc } from "firebase/firestore";

const LoginPage: React.FC = () => {
  const { login } = useAppContext();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const validate = () => {
    const newErrors: { email?: string; password?: string } = {};

    if (!email) {
      newErrors.email = "Email is required.";
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      newErrors.email = "Email is invalid.";
    }

    if (!password) {
      newErrors.password = "Password is required.";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setGeneralError(null);

    if (!validate()) return;

    try {
      setLoading(true);

      // 1) Firebase Auth ile giriş
      const credential = await signInWithEmailAndPassword(auth, email, password);
      const firebaseUser = credential.user;

      if (!firebaseUser) {
        throw new Error("No user returned from Firebase Auth.");
      }

      const uid = firebaseUser.uid;

      // 2) Firestore'dan user profili (isim, rol vs.) çek
      const userDocRef = doc(db, "users", uid);
      const snap = await getDoc(userDocRef);

      if (!snap.exists()) {
        throw new Error(
          "User profile not found in Firestore. Please contact the administrator."
        );
      }

      const data = snap.data() as Partial<User> & {
        role?: string;
        name?: string;
        email?: string;
      };

      // 3) AppContext'in beklediği formatta user objesi hazırla
      // Burada Omit<User, 'uid'> varsayıyoruz (senin önceki koduna uygun)
      const appUser: Omit<User, "uid"> = {
        name: data.name || firebaseUser.displayName || "",
        email: firebaseUser.email || data.email || email,
        role: (data.role as any) || "Team",
        password: "", // password'ü state'te tutmuyoruz
      };

      // 4) App context'e login bilgisini gönder
      login(appUser);
    } catch (err: any) {
      console.error(err);
      setGeneralError(
        err?.message === "Firebase: Error (auth/invalid-credential)." ||
          err?.code === "auth/invalid-credential"
          ? "Incorrect email or password. Please try again."
          : err.message || "Login failed. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-teal-500">surgero</h1>
          <p className="text-slate-400">Surgical Price Calculator</p>
        </div>
        <Card>
          <form onSubmit={handleSubmit} className="space-y-6">
            <h2 className="text-xl font-semibold text-center text-slate-100">
              Login
            </h2>

            <Input
              id="email"
              name="email"
              type="email"
              label="Email Address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              error={errors.email}
              autoComplete="email"
              required
            />

            <Input
              id="password"
              name="password"
              type="password"
              label="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={errors.password}
              autoComplete="current-password"
              required
            />

            {generalError && (
              <p className="text-sm text-red-500 text-center">{generalError}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-teal-600 text-white py-2 px-4 rounded-md hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-500 transition-colors disabled:opacity-60"
            >
              {loading ? "Logging in..." : "Log In"}
            </button>
          </form>
        </Card>
      </div>
    </div>
  );
};

export default LoginPage;
