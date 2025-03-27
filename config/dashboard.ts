import { SidebarNavItem } from "types";

// UserRole enum 대신 문자열 상수 사용
const USER_ROLES = {
  ADMIN: "ADMIN",
  USER: "USER"
};

export const sidebarLinks: SidebarNavItem[] = [
  {
    title: "MENU",
    items: [
      {
        href: "/admin",
        icon: "laptop",
        title: "Admin Panel",
        authorizeOnly: USER_ROLES.ADMIN,
      },
      { href: "/dashboard", icon: "dashboard", title: "Dashboard" },
      { href: "/dashboard/soomgo", icon: "messages", title: "Soomgo" },
      {
        href: "/admin/orders",
        icon: "package",
        title: "Orders",
        badge: 2,
        authorizeOnly: USER_ROLES.ADMIN,
      },
    ],
  },
  {
    title: "OPTIONS",
    items: [
      { href: "/dashboard/settings", icon: "settings", title: "Settings" },
      { href: "/", icon: "home", title: "Homepage" },
    ],
  },
];
