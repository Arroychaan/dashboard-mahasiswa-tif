import { LoadingState } from "~/components/admin/AdminStates";

export default function AdminLoading() {
  return (
    <div className="py-12">
      <LoadingState message="Memuat halaman administrasi..." />
    </div>
  );
}

