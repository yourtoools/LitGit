import type { SVGProps } from "react";

interface AntigravityProps extends SVGProps<SVGSVGElement> {
  title?: string;
}

const Antigravity = ({ title = "Antigravity", ...props }: AntigravityProps) => (
  <svg {...props} fill="none" viewBox="0 0 16 15">
    <title>{title}</title>
    <mask
      height="15"
      id="mask0_111_52"
      maskUnits="userSpaceOnUse"
      style={{ maskType: "alpha" }}
      width="16"
      x="0"
      y="0"
    >
      <path
        d="M14.08 13.98C14.95 14.63 16.25 14.2 15.05 13.01C11.48 9.54 12.23 0 7.79 0C3.35 0 4.1 9.54 0.53 13.01C-0.77 14.31 0.64 14.63 1.5 13.98C4.86 11.71 4.65 7.7 7.79 7.7C10.93 7.7 10.72 11.71 14.08 13.98Z"
        fill="black"
      />
    </mask>
    <g mask="url(#mask0_111_52)">
      <g filter="url(#filter0_f_111_52)">
        <path
          d="M-0.66 -3.23C-0.92 -0.91 1.08 1.23 3.81 1.54C6.55 1.85 8.98 0.22 9.24 -2.11C9.51 -4.43 7.5 -6.57 4.77 -6.88C2.04 -7.19 -0.4 -5.55 -0.66 -3.23Z"
          fill="#FFE432"
        />
      </g>
      <g filter="url(#filter1_f_111_52)">
        <path
          d="M9.88 4.37C10.57 7.32 13.57 9.14 16.58 8.44C19.59 7.74 21.48 4.78 20.8 1.83C20.11 -1.12 17.11 -2.94 14.1 -2.24C11.09 -1.54 9.2 1.42 9.88 4.37Z"
          fill="#FC413D"
        />
      </g>
      <g filter="url(#filter2_f_111_52)">
        <path
          d="M-8.05 6.35C-7.19 9.39 -3.29 10.95 0.65 9.83C4.6 8.7 7.09 5.33 6.23 2.28C5.36 -0.76 1.46 -2.32 -2.48 -1.2C-6.42 -0.08 -8.92 3.3 -8.05 6.35Z"
          fill="#00B95C"
        />
      </g>
      <g filter="url(#filter3_f_111_52)">
        <path
          d="M-8.05 6.35C-7.19 9.39 -3.29 10.95 0.65 9.83C4.6 8.7 7.09 5.33 6.23 2.28C5.36 -0.76 1.46 -2.32 -2.48 -1.2C-6.42 -0.08 -8.92 3.3 -8.05 6.35Z"
          fill="#00B95C"
        />
      </g>
      <g filter="url(#filter4_f_111_52)">
        <path
          d="M-4.92 8.87C-2.75 11.08 0.98 10.94 3.42 8.56C5.86 6.17 6.08 2.43 3.91 0.22C1.74 -2 -2 -1.86 -4.44 0.53C-6.87 2.92 -7.09 6.65 -4.92 8.87Z"
          fill="#00B95C"
        />
      </g>
      <g filter="url(#filter5_f_111_52)">
        <path
          d="M6.43 17.23C7.1 20.13 9.91 21.95 12.71 21.3C15.5 20.66 17.22 17.78 16.54 14.88C15.87 11.98 13.06 10.15 10.27 10.8C7.47 11.45 5.75 14.33 6.43 17.23Z"
          fill="#3186FF"
        />
      </g>
      <g filter="url(#filter6_f_111_52)">
        <path
          d="M1.67 -5.95C0.25 -2.8 1.8 0.95 5.11 2.44C8.43 3.93 12.26 2.59 13.67 -0.56C15.08 -3.7 13.54 -7.45 10.22 -8.94C6.91 -10.43 3.08 -9.09 1.67 -5.95Z"
          fill="#FBBC04"
        />
      </g>
      <g filter="url(#filter7_f_111_52)">
        <path
          d="M-2.11 24.39C-5.53 23.05 0.31 12.02 1.76 8.32C3.21 4.62 7.16 2.71 10.57 4.05C13.99 5.39 18.04 12.78 16.58 16.48C15.13 20.17 1.3 25.73 -2.11 24.39Z"
          fill="#3186FF"
        />
      </g>
      <g filter="url(#filter8_f_111_52)">
        <path
          d="M18.58 10.66C17.67 11.73 15.28 11.18 13.25 9.44C11.22 7.71 10.32 5.43 11.23 4.36C12.15 3.3 14.53 3.84 16.56 5.58C18.59 7.32 19.5 9.59 18.58 10.66Z"
          fill="#749BFF"
        />
      </g>
      <g filter="url(#filter9_f_111_52)">
        <path
          d="M11.76 5.23C15.52 7.77 19.85 7.94 21.43 5.6C23.01 3.26 21.24 -0.7 17.48 -3.24C13.72 -5.78 9.39 -5.95 7.81 -3.61C6.23 -1.27 7.99 2.68 11.76 5.23Z"
          fill="#FC413D"
        />
      </g>
      <g filter="url(#filter10_f_111_52)">
        <path
          d="M-0.59 1.09C-1.52 3.34 -1.22 5.6 0.09 6.14C1.39 6.68 3.21 5.3 4.14 3.05C5.07 0.8 4.77 -1.46 3.46 -2C2.15 -2.54 0.34 -1.16 -0.59 1.09Z"
          fill="#FFEE48"
        />
      </g>
    </g>
    <defs>
      <filter
        colorInterpolationFilters="sRGB"
        filterUnits="userSpaceOnUse"
        height="11.38"
        id="filter0_f_111_52"
        width="12.84"
        x="-2.13"
        y="-8.36"
      >
        <feFlood floodOpacity="0" result="BackgroundImageFix" />
        <feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
        <feGaussianBlur
          result="effect1_foregroundBlur_111_52"
          stdDeviation="0.72"
        />
      </filter>
      <filter
        colorInterpolationFilters="sRGB"
        filterUnits="userSpaceOnUse"
        height="24.96"
        id="filter1_f_111_52"
        width="25.18"
        x="2.75"
        y="-9.38"
      >
        <feFlood floodOpacity="0" result="BackgroundImageFix" />
        <feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
        <feGaussianBlur
          result="effect1_foregroundBlur_111_52"
          stdDeviation="3.5"
        />
      </filter>
      <filter
        colorInterpolationFilters="sRGB"
        filterUnits="userSpaceOnUse"
        height="23.63"
        id="filter2_f_111_52"
        width="26.51"
        x="-14.17"
        y="-7.5"
      >
        <feFlood floodOpacity="0" result="BackgroundImageFix" />
        <feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
        <feGaussianBlur
          result="effect1_foregroundBlur_111_52"
          stdDeviation="2.97"
        />
      </filter>
      <filter
        colorInterpolationFilters="sRGB"
        filterUnits="userSpaceOnUse"
        height="23.63"
        id="filter3_f_111_52"
        width="26.51"
        x="-14.17"
        y="-7.5"
      >
        <feFlood floodOpacity="0" result="BackgroundImageFix" />
        <feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
        <feGaussianBlur
          result="effect1_foregroundBlur_111_52"
          stdDeviation="2.97"
        />
      </filter>
      <filter
        colorInterpolationFilters="sRGB"
        filterUnits="userSpaceOnUse"
        height="23.68"
        id="filter4_f_111_52"
        width="23.71"
        x="-12.36"
        y="-7.3"
      >
        <feFlood floodOpacity="0" result="BackgroundImageFix" />
        <feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
        <feGaussianBlur
          result="effect1_foregroundBlur_111_52"
          stdDeviation="2.97"
        />
      </filter>
      <filter
        colorInterpolationFilters="sRGB"
        filterUnits="userSpaceOnUse"
        height="22.06"
        id="filter5_f_111_52"
        width="21.7"
        x="0.63"
        y="5.02"
      >
        <feFlood floodOpacity="0" result="BackgroundImageFix" />
        <feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
        <feGaussianBlur
          result="effect1_foregroundBlur_111_52"
          stdDeviation="2.82"
        />
      </filter>
      <filter
        colorInterpolationFilters="sRGB"
        filterUnits="userSpaceOnUse"
        height="22.83"
        id="filter6_f_111_52"
        width="23.29"
        x="-3.98"
        y="-14.67"
      >
        <feFlood floodOpacity="0" result="BackgroundImageFix" />
        <feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
        <feGaussianBlur
          result="effect1_foregroundBlur_111_52"
          stdDeviation="2.56"
        />
      </filter>
      <filter
        colorInterpolationFilters="sRGB"
        filterUnits="userSpaceOnUse"
        height="30.11"
        id="filter7_f_111_52"
        width="29.2"
        x="-7.74"
        y="-0.95"
      >
        <feFlood floodOpacity="0" result="BackgroundImageFix" />
        <feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
        <feGaussianBlur
          result="effect1_foregroundBlur_111_52"
          stdDeviation="2.29"
        />
      </filter>
      <filter
        colorInterpolationFilters="sRGB"
        filterUnits="userSpaceOnUse"
        height="15.57"
        id="filter8_f_111_52"
        width="16.24"
        x="6.79"
        y="-0.27"
      >
        <feFlood floodOpacity="0" result="BackgroundImageFix" />
        <feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
        <feGaussianBlur
          result="effect1_foregroundBlur_111_52"
          stdDeviation="2.04"
        />
      </filter>
      <filter
        colorInterpolationFilters="sRGB"
        filterUnits="userSpaceOnUse"
        height="19.42"
        id="filter9_f_111_52"
        width="21.69"
        x="3.78"
        y="-8.72"
      >
        <feFlood floodOpacity="0" result="BackgroundImageFix" />
        <feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
        <feGaussianBlur
          result="effect1_foregroundBlur_111_52"
          stdDeviation="1.73"
        />
      </filter>
      <filter
        colorInterpolationFilters="sRGB"
        filterUnits="userSpaceOnUse"
        height="16.93"
        id="filter10_f_111_52"
        width="14.36"
        x="-5.41"
        y="-6.39"
      >
        <feFlood floodOpacity="0" result="BackgroundImageFix" />
        <feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
        <feGaussianBlur
          result="effect1_foregroundBlur_111_52"
          stdDeviation="2.14"
        />
      </filter>
    </defs>
  </svg>
);

export { Antigravity };
