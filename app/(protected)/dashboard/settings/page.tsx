import { redirect } from "next/navigation";
import { UserRole } from "@prisma/client";

import { getCurrentUser } from "@/lib/session";
import { constructMetadata } from "@/lib/utils";
import { DeleteAccountSection } from "@/components/dashboard/delete-account";
import { DashboardHeader } from "@/components/dashboard/header";
import { UserNameForm } from "@/components/forms/user-name-form";
import { UserRoleForm } from "@/components/forms/user-role-form";

export const metadata = constructMetadata({
  title: "Settings – SaaS Starter",
  description: "Configure your account and website settings.",
});

export default async function SettingsPage() {
  const user = await getCurrentUser();

  // 인증 검사 임시 제거 및 가상 사용자 생성
  const mockUser = user || {
    id: "test-user-id",
    name: "Test User",
    email: "test@example.com",
    role: UserRole.USER
  };

  // if (!user?.id) redirect("/login");

  return (
    <>
      <DashboardHeader
        heading="Settings"
        text="Manage account and website settings."
      />
      <div className="divide-y divide-muted pb-10">
        <UserNameForm user={{ id: mockUser.id, name: mockUser.name || "" }} />
        <UserRoleForm user={{ id: mockUser.id, role: mockUser.role }} />
        <DeleteAccountSection />
      </div>
    </>
  );
}
