"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { PreferencesForm } from "@/components/study/preferences-form";
import { Card, CardContent } from "@/components/ui/card";

export default function OnboardingPage() {
  const router = useRouter();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        eyebrow="Welcome"
        title="Let's set up your study plan"
        description="Pick your exams and a daily goal. Everything is optional and you can change it later in your profile."
      />
      <Card>
        <CardContent className="pt-5 sm:pt-6">
          <PreferencesForm submitLabel="Save and go to dashboard" markOnboarded onSaved={() => router.push("/dashboard")} />
        </CardContent>
      </Card>
      <p className="mt-4 text-center text-sm text-muted-foreground">
        <Link href="/dashboard" className="hover:text-foreground">
          Skip for now
        </Link>
      </p>
    </div>
  );
}
