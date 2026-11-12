import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { Menu, X } from "lucide-react";

export function Brand({ className = "brand" }) {
  return (
    <Link className={className} to="/" aria-label="Amallina Beauty Salon home">
      <img
        src="/images/amallina-logo.png"
        alt="Amallina Beauty Salon"
        className="brand-logo"
        width="118"
        height="60"
        decoding="async"
      />
    </Link>
  );
}

export default function Layout() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const main = useRef(null);

  useEffect(() => {
    window.scrollTo(0, 0);
    document.title = `${pathname.startsWith("/appointments") ? pathname.endsWith("/manage") ? "My Booking" : "Book Appointment" : pathname.startsWith("/queue") ? "Queue" : { "/": "Home", "/services": "Services", "/about": "About", "/contact": "Contact", "/track": "My Booking" }[pathname] || "Page not found"} · Amallina Beauty Salon`;
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
        <span>Amallina Beauty Salon</span>
        <span>·</span>
        <span>2910 Pillsbury Ave #263, Minneapolis, MN</span>
        <span>·</span>
        <a href="tel:+16128004944" style={{ color: "inherit", textDecoration: "underline" }}>
          +1 (612) 800-4944
        </a>
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
            <p className="footer-tagline">
              Amallina Beauty Salon · Henna artistry & beauty care in Minneapolis, Minnesota.
            </p>
            <div className="footer-contact">
              <p>2910 Pillsbury Ave #263, Minneapolis, MN 55408</p>
              <p>
                <a href="tel:+16128004944">+1 (612) 800-4944</a>
                <span> · </span>
                <a href="mailto:qurux21b@gmail.com">qurux21b@gmail.com</a>
              </p>
            </div>
          </div>
          <div>
            <h3>Explore</h3>
            <Link to="/services">Services</Link>
            <Link to="/about">About</Link>
            <Link to="/contact">Contact & Location</Link>
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
            © {new Date().getFullYear()} Amallina Beauty Salon. All rights reserved.
          </span>
          <Link className="team-access" to="/staff">Team Access</Link>
        </div>
      </footer>
    </>
  );
}
