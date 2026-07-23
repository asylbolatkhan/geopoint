export default function Card({ className = '', children, ...props }) {
  return (
    <div
      className={`bg-slate-800/60 border border-slate-700 rounded-2xl p-4 ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
