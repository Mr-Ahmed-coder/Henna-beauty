import { Link } from "react-router-dom";
import ServiceCatalogue from "../catalogue/ServiceCatalogue";

export default function Home() {
  return (
    <>
      <section className="hero container">
        <div className="hero-copy">
          <p className="eyebrow">
            <span className="short-line" aria-hidden="true" />
            AMALLINA BEAUTY SALON · MINNEAPOLIS, MN
          </p>
          <h1>
            Beauty & care,<br />
            <em>naturally yours.</em>
          </h1>
          <p className="hero-description">
            Dedicated henna artistry, beauty treatments, and personal styling for Minnesota’s Somali and local community. Book an appointment in advance or join our virtual queue for walk-ins.
          </p>
          <div className="actions">
            <Link className="button" to="/appointments">Book Appointment</Link>
            <Link className="text-link" to="/queue">Join Queue</Link>
          </div>
          <div className="hero-location-badge">
            <strong>Visit us:</strong> 2910 Pillsbury Ave #263, Minneapolis, MN ·{" "}
            <a href="tel:+16128004944">+1 (612) 800-4944</a>
          </div>
        </div>
        <div className="hero-visual">
          <img
            className="hero-photo"
            src="/images/somali-beauty.svg"
            alt="Modest hijab and henna beauty illustration"
            width="720"
            height="960"
            fetchPriority="high"
          />
          <span className="photo-note">Illustration · Somali beauty artwork</span>
        </div>
      </section>
      <section className="services-section container">
        <div className="section-heading">
          <div>
            <p className="eyebrow">OUR SERVICES</p>
            <h2>Beauty & Henna Services</h2>
          </div>
          <Link className="text-link" to="/services">View All Services</Link>
        </div>
        <ServiceCatalogue limit={3} />
      </section>
    </>
  );
}
