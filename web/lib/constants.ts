/** Python backend base URL — override via NEXT_PUBLIC_API_BASE_URL */
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

/** Request timeout in milliseconds */
export const API_TIMEOUT_MS = 30_000;

/** Navigation links rendered in the Navbar */
export const NAV_LINKS = [
  { label: "홈",      href: "/"           },
  { label: "대시보드", href: "/dashboard"  },
  { label: "문서",    href: "/docs"       },
] as const;

/** Footer link groups */
export const FOOTER_LINKS = [
  {
    heading: "제품",
    links: [
      { label: "기능",      href: "/#features"      },
      { label: "작동 방식", href: "/#how-it-works"  },
      { label: "대시보드",  href: "/dashboard"      },
    ],
  },
  {
    heading: "개발자",
    links: [
      { label: "문서",          href: "/docs"             },
      { label: "API 레퍼런스",  href: "/docs/api"         },
      { label: "GitHub",        href: "https://github.com" },
    ],
  },
  {
    heading: "회사",
    links: [
      { label: "소개",  href: "/about"   },
      { label: "블로그", href: "/blog"   },
      { label: "문의",  href: "/contact" },
    ],
  },
] as const;

/** Site-wide branding */
export const SITE_NAME = "에듀렌즈";
export const SITE_TAGLINE = "교육의 흐름을 맑게 비추는 렌즈, 에듀렌즈";
