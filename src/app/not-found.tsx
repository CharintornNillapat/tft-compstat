import Link from "next/link";
import { PageHeader } from "@/components/page-header";

export default function NotFound() {
  return (
    <>
      <PageHeader title="Not found" description="That page doesn't exist." />
      <Link href="/" className="text-accent hover:underline">
        Back to overview
      </Link>
    </>
  );
}
