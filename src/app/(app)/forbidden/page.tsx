import { ButtonLink, Card } from "@/components/ui";
import { ShieldAlert } from "@/components/icons";

export const metadata = { title: "Not allowed" };

export default function ForbiddenPage() {
  return (
    <div className="mx-auto max-w-md pt-12">
      <Card className="p-6 text-center">
        <ShieldAlert aria-hidden className="mx-auto h-8 w-8 text-amber-500" />
        <h1 className="mt-2 text-xl font-bold">Not allowed</h1>
        <p className="mt-2 text-sm text-gray-600">
          Your account doesn&apos;t have permission for that page. Roles are
          set by an administrator — ask one to change yours if you need
          access.
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <ButtonLink href="/dashboard">Back to dashboard</ButtonLink>
          <ButtonLink href="/requests/new" variant="secondary">
            Submit a request
          </ButtonLink>
        </div>
      </Card>
    </div>
  );
}
