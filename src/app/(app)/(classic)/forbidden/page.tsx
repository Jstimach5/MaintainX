import { ButtonLink, Card, PageHeader } from "@/components/ui";

export const metadata = { title: "Not allowed" };

export default function ForbiddenPage() {
  return (
    <div className="mx-auto max-w-md pt-12">
      <PageHeader title="Not allowed" />
      <Card>
        <p className="mb-4 text-sm text-gray-600">
          Your account does not have permission to view that page. Ask an
          administrator if you think you should have access.
        </p>
        <ButtonLink href="/dashboard" variant="secondary">
          Back to dashboard
        </ButtonLink>
      </Card>
    </div>
  );
}
