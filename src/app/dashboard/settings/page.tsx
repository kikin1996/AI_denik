import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { getOrCreateUserProfile } from "@/lib/user";
import { SettingsForm } from "@/components/settings-form";
import { Button } from "@/components/ui/button";

export default async function SettingsPage() {
  const profile = await getOrCreateUserProfile();
  if (!profile) {
    redirect("/login");
  }

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="container flex items-center gap-3 py-5">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/dashboard">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <span className="font-display text-lg">Nastavení</span>
        </div>
      </header>

      <div className="container max-w-xl py-10">
        <SettingsForm profile={profile} />
      </div>
    </main>
  );
}
