"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Mail, Lock, User, GraduationCap, ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { GoogleOAuthButton } from "@/components/auth/GoogleOAuthButton";

interface FormData {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
}

function validate(data: FormData): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!data.name.trim()) errors.name = "Name is required";
  if (!data.email) errors.email = "Email is required";
  else if (!/\S+@\S+\.\S+/.test(data.email)) errors.email = "Enter a valid email";
  if (!data.password) errors.password = "Password is required";
  else if (data.password.length < 8) errors.password = "At least 8 characters";
  if (data.password !== data.confirmPassword)
    errors.confirmPassword = "Passwords do not match";
  return errors;
}

export default function SignupPage() {
  const router = useRouter();
  const [form, setForm] = useState<FormData>({
    name: "", email: "", password: "", confirmPassword: "",
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState("");
  const [oauthError, setOauthError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  function update(field: keyof FormData, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    // Clear the field error as user types
    if (fieldErrors[field]) setFieldErrors((prev) => ({ ...prev, [field]: "" }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerError("");

    const errors = validate(form);
    if (Object.keys(errors).length) { setFieldErrors(errors); return; }
    setFieldErrors({});
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: { data: { full_name: form.name } },
    });

    setLoading(false);
    if (error) {
      setServerError(error.message);
    } else {
      setSuccess(true);
    }
  }

  if (success) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
        className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-10 text-center backdrop-blur-xl"
      >
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/10 ring-1 ring-emerald-500/20 text-3xl">
          ✉️
        </div>
        <h2 className="text-xl font-bold text-white">Check your inbox</h2>
        <p className="mt-2 text-sm text-white/50">
          We sent a confirmation link to{" "}
          <span className="text-white/80">{form.email}</span>.{" "}
          Click it to activate your account.
        </p>
        <p className="mt-1 text-xs text-white/30">
          (If you disabled email confirmation in Supabase, you can log in now.)
        </p>
        <Link href="/login">
          <Button variant="ghost" className="mt-6 w-full">Back to login</Button>
        </Link>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
    >
      {/* Header */}
      <div className="mb-7 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-500/10 ring-1 ring-brand-500/20">
          <GraduationCap className="h-7 w-7 text-brand-400" />
        </div>
        <h1 className="text-2xl font-bold text-white">Create your account</h1>
        <p className="mt-1 text-sm text-white/40">Start your learning journey today</p>
      </div>

      {/* Form card */}
      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-8 backdrop-blur-xl">
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <Input
            label="Full name"
            placeholder="Alex Johnson"
            icon={<User className="h-4 w-4" />}
            value={form.name}
            onChange={(e) => update("name", e.target.value)}
            error={fieldErrors.name}
          />
          <Input
            label="Email address"
            type="email"
            placeholder="alex@university.edu"
            icon={<Mail className="h-4 w-4" />}
            value={form.email}
            onChange={(e) => update("email", e.target.value)}
            error={fieldErrors.email}
          />
          <Input
            label="Password"
            type="password"
            placeholder="Minimum 8 characters"
            icon={<Lock className="h-4 w-4" />}
            value={form.password}
            onChange={(e) => update("password", e.target.value)}
            error={fieldErrors.password}
          />
          <Input
            label="Confirm password"
            type="password"
            placeholder="Repeat your password"
            icon={<Lock className="h-4 w-4" />}
            value={form.confirmPassword}
            onChange={(e) => update("confirmPassword", e.target.value)}
            error={fieldErrors.confirmPassword}
          />

          <AnimatePresence>
            {serverError && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                  {serverError}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <Button type="submit" loading={loading} size="lg" className="mt-1 w-full">
            Create account <ArrowRight className="h-4 w-4" />
          </Button>
        </form>

        {/* Divider */}
        <div className="my-5 flex items-center gap-3">
          <div className="h-px flex-1 bg-white/[0.07]" />
          <span className="text-xs text-white/30 select-none">or continue with</span>
          <div className="h-px flex-1 bg-white/[0.07]" />
        </div>

        <GoogleOAuthButton
          label="Sign up with Google"
          onError={setOauthError}
        />

        <AnimatePresence>
          {oauthError && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-3 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                {oauthError}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <p className="mt-6 text-center text-sm text-white/40">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-brand-400 hover:text-brand-300 transition-colors">
            Sign in
          </Link>
        </p>
      </div>
    </motion.div>
  );
}
