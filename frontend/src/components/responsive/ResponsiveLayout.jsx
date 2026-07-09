import { useEffect, useId } from "react";

function joinClasses(...classes) {
  return classes.filter(Boolean).join(" ");
}

export function ResponsiveContainer({
  as: Component = "section",
  children,
  className = "",
  size = "default",
  ...props
}) {
  return (
    <Component
      className={joinClasses("responsive-container", `responsive-container-${size}`, className)}
      {...props}
    >
      {children}
    </Component>
  );
}

export function ResponsiveGrid({
  as: Component = "div",
  children,
  className = "",
  density = "comfortable",
  min = "260px",
  ...props
}) {
  return (
    <Component
      className={joinClasses("responsive-grid", `responsive-grid-${density}`, className)}
      style={{ "--responsive-grid-min": min, ...props.style }}
      {...props}
    >
      {children}
    </Component>
  );
}

export function ResponsiveStack({
  as: Component = "div",
  children,
  className = "",
  gap = "md",
  ...props
}) {
  return (
    <Component
      className={joinClasses("responsive-stack", `responsive-stack-${gap}`, className)}
      {...props}
    >
      {children}
    </Component>
  );
}

export function ResponsivePanel({
  as: Component = "section",
  children,
  className = "",
  tone = "default",
  ...props
}) {
  return (
    <Component
      className={joinClasses("responsive-panel", `responsive-panel-${tone}`, className)}
      {...props}
    >
      {children}
    </Component>
  );
}

export function ResponsiveTable({
  children,
  className = "",
  label = "Data table",
  ...props
}) {
  return (
    <div className={joinClasses("responsive-table", className)} role="region" aria-label={label} {...props}>
      {children}
    </div>
  );
}

export function MobileDrawer({
  children,
  className = "",
  isOpen,
  label = "Menu",
  onClose,
}) {
  const titleId = useId();

  useEffect(() => {
    if (!isOpen) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose?.();
    };

    document.body.classList.add("mobile-drawer-open");
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.classList.remove("mobile-drawer-open");
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="mobile-drawer-layer" role="presentation">
      <button
        aria-label="Close menu"
        className="mobile-drawer-backdrop"
        onClick={onClose}
        type="button"
      />
      <aside
        aria-labelledby={titleId}
        aria-modal="true"
        className={joinClasses("mobile-drawer", className)}
        role="dialog"
      >
        <div className="mobile-drawer-header">
          <strong id={titleId}>{label}</strong>
          <button onClick={onClose} type="button">Close</button>
        </div>
        {children}
      </aside>
    </div>
  );
}

export function BottomActionBar({ children, className = "", ...props }) {
  return (
    <nav className={joinClasses("bottom-action-bar", className)} {...props}>
      {children}
    </nav>
  );
}
