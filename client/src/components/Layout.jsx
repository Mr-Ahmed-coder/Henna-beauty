import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { Menu, X } from "lucide-react";
export function Brand() {
  return (
    <Link className="brand" to="/" aria-label="Henna and Beauty home">
      <span className="brand-mark" aria-hidden="true">
        ✳
      </span>
      <span>
        henna & beauty<small>MINNESOTA</small>
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
    document.title = `${pathname.startsWith("/appointments") ? pathname.endsWith("/manage") ? "My Booking" : "Book Appointment" : pathname.startsWith("/queue") ? "Queue" : { "/": "Home", "/services": "Services", "/about": "About", "/contact": "Contact", "/track": "My Booking" }[pathname] || "Page not found"} · Henna & Beauty Preview`;
    main.current?.focus();
  }, [pathname]);
  return (
    <>
      <a
        className="skip-link"
        href="#main"
        onClick={(event) => {
          event.preventDefault();
          main.current?.focus();
          main.current?.scrollIntoView();
        }}
      >
        Skip to content
      </a>
      <div className="preview-banner">
        Preview website · Salon details are awaiting confirmation.
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
              ["/about", "About"],
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
              Book Appointment
            </Link>
            <Link to="/queue" onClick={() => setOpen(false)}>
              Join Queue
            </Link>
            <Link to="/track" onClick={() => setOpen(false)}>
              My Booking
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
              Henna & beauty for Minnesota’s Somali community.
            </p>
          </div>
          <div>
            <h3>Explore</h3>
            <Link to="/services">Services</Link>
            <Link to="/about">About</Link>
            <Link to="/contact">Contact & location</Link>
          </div>
          <div>
            <h3>Plan your visit</h3>
            <Link to="/appointments">Book Appointment</Link>
            <Link to="/queue">Join Queue</Link>
            <Link to="/track">My Booking</Link>
          </div>
        </div>
        <div className="footer-bottom">
          <span>
            © {new Date().getFullYear()} Henna & Beauty
          </span>
          <Link className="team-access" to="/staff">Team Access</Link>
        </div>
      </footer>
    </>
  );
}
