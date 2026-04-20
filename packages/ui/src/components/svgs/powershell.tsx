import type { SVGProps } from "react";

interface PowershellProps extends SVGProps<SVGSVGElement> {
  title?: string;
}

const Powershell = ({ title = "PowerShell", ...props }: PowershellProps) => (
  <svg {...props} fill="none" viewBox="0 0 24 24">
    <title>{title}</title>
    <rect fill="#0F172A" height="16" rx="3" width="18" x="3" y="4" />
    <path
      d="m7.65 9.2 3.15 2.8-3.15 2.8m4.4 1.2h4.1"
      stroke="#F8FAFC"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
    />
  </svg>
);

export { Powershell };
