function IconBase({ children, size = 18, strokeWidth = 1.75 }) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={strokeWidth}
      viewBox="0 0 24 24"
      width={size}
    >
      {children}
    </svg>
  );
}

export function LayoutDashboard(props) {
  return (
    <IconBase {...props}>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </IconBase>
  );
}

export function Radar(props) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 12L17 7" />
      <path d="M12 4a8 8 0 0 1 8 8" />
      <path d="M12 8a4 4 0 0 1 4 4" />
    </IconBase>
  );
}

export function Star(props) {
  return (
    <IconBase {...props}>
      <path d="M12 3.5l2.7 5.47 6.03.88-4.36 4.25 1.03 6-5.4-2.84-5.4 2.84 1.03-6L3.27 9.85l6.03-.88L12 3.5z" />
    </IconBase>
  );
}

export function CheckSquare(props) {
  return (
    <IconBase {...props}>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="M8 12.5l2.5 2.5L16.5 9" />
    </IconBase>
  );
}

export function ArrowLeftRight(props) {
  return (
    <IconBase {...props}>
      <path d="M8 7H20" />
      <path d="M17 4l3 3-3 3" />
      <path d="M16 17H4" />
      <path d="M7 20l-3-3 3-3" />
    </IconBase>
  );
}

export function Briefcase(props) {
  return (
    <IconBase {...props}>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7" />
      <path d="M3 11h18" />
    </IconBase>
  );
}

export function Bell(props) {
  return (
    <IconBase {...props}>
      <path d="M6 9a6 6 0 1 1 12 0c0 6 2 7 2 7H4s2-1 2-7" />
      <path d="M10 19a2 2 0 0 0 4 0" />
    </IconBase>
  );
}

export function Settings(props) {
  return (
    <IconBase {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3" />
      <path d="M12 19v3" />
      <path d="M4.93 4.93l2.12 2.12" />
      <path d="M16.95 16.95l2.12 2.12" />
      <path d="M2 12h3" />
      <path d="M19 12h3" />
      <path d="M4.93 19.07l2.12-2.12" />
      <path d="M16.95 7.05l2.12-2.12" />
    </IconBase>
  );
}

export function FlaskConical(props) {
  return (
    <IconBase {...props}>
      <path d="M10 3h4" />
      <path d="M10 3v5l-5.5 9.5A2 2 0 0 0 6.23 21h11.54a2 2 0 0 0 1.73-3.5L14 8V3" />
      <path d="M8 14h8" />
    </IconBase>
  );
}

export function BookOpen(props) {
  return (
    <IconBase {...props}>
      <path d="M12 7a4 4 0 0 0-4-2H5a2 2 0 0 0-2 2v11a1 1 0 0 0 1.5.86A8 8 0 0 1 8 18a4 4 0 0 1 4 2" />
      <path d="M12 7a4 4 0 0 1 4-2h3a2 2 0 0 1 2 2v11a1 1 0 0 1-1.5.86A8 8 0 0 0 16 18a4 4 0 0 0-4 2" />
    </IconBase>
  );
}

export function ShieldCheck(props) {
  return (
    <IconBase {...props}>
      <path d="M12 3l7 3v5c0 4.8-2.8 7.84-7 10-4.2-2.16-7-5.2-7-10V6l7-3z" />
      <path d="M9 12.5l2 2L15.5 10" />
    </IconBase>
  );
}

export function Landmark(props) {
  return (
    <IconBase {...props}>
      <path d="M3 10h18" />
      <path d="M4 20h16" />
      <path d="M6 10v10" />
      <path d="M10 10v10" />
      <path d="M14 10v10" />
      <path d="M18 10v10" />
      <path d="M12 4l8 4H4l8-4z" />
    </IconBase>
  );
}

export function Crown(props) {
  return (
    <IconBase {...props}>
      <path d="M4 18h16l-1.5-9-4.5 4-2-6-2 6-4.5-4L4 18z" />
      <path d="M4 18h16" />
    </IconBase>
  );
}

export function Telescope(props) {
  return (
    <IconBase {...props}>
      <path d="M5 18l4-4" />
      <path d="M8 21l3-5" />
      <path d="M14 13l3 7" />
      <path d="M4 9l13-6 3 6-13 6z" />
      <path d="M8 7l3 6" />
    </IconBase>
  );
}
