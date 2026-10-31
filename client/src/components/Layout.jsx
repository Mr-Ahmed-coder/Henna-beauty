import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { ArrowUpRight, Menu, X, Sparkles } from "lucide-react";
export function Brand() {
  return (
    <Link className="brand" to="/" aria-label="Henna and Beauty home">
      <span className="brand-mark" aria-hidden="true">
        ✳
      </span>
      <span>
        henna & beauty<small>THE SALON CONCEPT</small>
      </span>
    </Link>
  );
}
export default function Layout() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const main = useRef(null);
  useEffect(() => {
    window.scrollTo(0, 0);
    document.title = `${{ "/": "Home", "/services": "Services", "/about": "About", "/contact": "Contact", "/appointments": "Appointments", "/queue": "Queue" }[pathname] || "Page not found"} · Henna & Beauty Preview`;
    main.current?.focus();
  }, [pathname]);
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <div className="preview-banner">
        A little glimpse of what’s to come <span>·</span> Preview website —
        salon details are placeholders
      </div>
      <header>
        <div className="nav-wrap">
          <Brand />
          <button
            className="menu-toggle"
            aria-expanded={open}
            aria-controls="navigation"
            aria-label={open ? "Close navigation" : "Open navigation"}
            onClick={() => setOpen(!open)}
          >
            {open ? <X /> : <Menu />}
          </button>
          <nav
            id="navigation"
            className={open ? "navigation open" : "navigation"}
            aria-label="Main navigation"
          >
            {[
              ["/", "Home"],
              ["/services", "Services"],
              ["/about", "Our story"],
              ["/contact", "Contact"],
            ].map(([to, label]) => (
              <NavLink key={to} to={to} end onClick={() => setOpen(false)}>
                {label}
              </NavLink>
            ))}
            <Link
              to="/appointments"
              className="button nav-appointment"
              onClick={() => setOpen(false)}
            >
              Appointments <ArrowUpRight size={16} />
            </Link>
          </nav>
        </div>
      </header>
      <main id="main" tabIndex={-1} ref={main}>
        <Outlet />
      </main>
      <footer>
        <div className="footer-top">
          <div>
            <Brand />
            <p>
              Artful details. Thoughtful care.
              <br />A little time, just for you.
            </p>
          </div>
          <div>
            <h3>Explore</h3>
            <Link to="/services">Our services</Link>
            <Link to="/about">Our story</Link>
            <Link to="/contact">Contact & location</Link>
          </div>
          <div>
            <h3>Plan your visit</h3>
            <Link to="/appointments">
              Appointments <span>Coming soon</span>
            </Link>
            <Link to="/queue">
              Walk-in queue <span>Coming soon</span>
            </Link>
            <p>Hours & location to be confirmed.</p>
          </div>
        </div>
        <div className="footer-bottom">
          <span>
            © {new Date().getFullYear()} Henna & Beauty · Placeholder business
            name
          </span>
          <span>
            <Sparkles size={13} /> A salon concept, thoughtfully made.
          </span>
        </div>
      </footer>
    </>
  );
}
