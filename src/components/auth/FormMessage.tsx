type FormMessageProps = {
  type: "error" | "success" | "info";
  children: React.ReactNode;
};

const styles = {
  error: "border-red-400/30 bg-red-500/10 text-red-100",
  success: "border-emerald-400/30 bg-emerald-500/10 text-emerald-100",
  info: "border-secondary/30 bg-secondary/10 text-light-purple",
};

export function FormMessage({ type, children }: FormMessageProps) {
  return (
    <div
      role={type === "error" ? "alert" : "status"}
      className={`rounded-xl border px-4 py-3 text-sm leading-6 ${styles[type]}`}
    >
      {children}
    </div>
  );
}
