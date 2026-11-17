import Link from "next/link";
export default function NotFound() {
  return (
    <div className="panel mx-auto max-w-md p-8 text-center">
      <div className="label mb-2">404</div>
      <h1 className="text-xl font-semibold">Page introuvable</h1>
      <Link href="/" className="btn btn-primary mt-6">Retour au Dashboard</Link>
    </div>
  );
}
