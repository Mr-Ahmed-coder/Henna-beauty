import { Link } from "react-router-dom";
import ServiceCatalogue from "../catalogue/ServiceCatalogue";
export default function Home() {
  return (
    <>
      <section className="hero container">
        <div className="hero-copy">
          <p className="eyebrow">HENNA & BEAUTY · MINNESOTA</p>
          <h1>Henna & beauty,<br /><em>your way.</em></h1>
          <p className="hero-description">Henna and beauty services for Minnesota’s Somali community. Choose a service and a time that works for you.</p>
          <div className="actions">
            <Link className="button" to="/appointments">Book Appointment</Link>
            <Link className="text-link" to="/queue">Join Queue</Link>
          </div>
        </div>
        <div className="hero-visual">
          <img className="hero-photo" src="/images/somali-beauty.svg"
            alt="Original illustration of a woman in a plum hijab with decorative henna on her hand"
            width="720" height="960" fetchPriority="high" />
          <span className="photo-note">Illustration · not salon staff or work</span>
        </div>
      </section>
      <section className="services-section container">
        <div className="section-heading">
          <h2>Our services</h2>
          <Link className="text-link" to="/services">View All Services</Link>
        </div>
        <ServiceCatalogue limit={3} />
      </section>
    </>
  );
}
