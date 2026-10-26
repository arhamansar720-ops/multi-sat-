"use client";

import { HardDrive } from "lucide-react";
import Link from "next/link";
import { useApp } from "@/components/providers/app-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function AuthCard({ title, description, children }: { title: string; description?: React.ReactNode; children: React.ReactNode }) {
  const { config } = useApp();
  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-xl">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        {config.mode === "demo" ? (
          <div className="space-y-4 text-center">
            <HardDrive className="mx-auto size-8 text-muted-foreground" aria-hidden />
            <p className="text-sm text-muted-foreground">
              Accounts need a connected Supabase backend, which this deployment doesn&apos;t have. You can use every solo feature right now in demo mode; progress stays in this browser.
            </p>
            <Button asChild className="w-full">
              <Link href="/dashboard">Continue in demo mode</Link>
            </Button>
          </div>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}
