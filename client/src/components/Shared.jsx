import { Link } from "react-router-dom";
import { ArrowUpRight, ArrowRight } from "lucide-react";
export function PageHeading({ eyebrow, title, children }) {
  return (
    <section className="page-heading container">
      <p className="eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      <p className="intro">{children}</p>
    </section>
  );
}
export function VisitCTA() {
  return (
    <section className="visit container">
      <div>
        <p className="eyebrow">MAKE SPACE FOR YOURSELF</p>
        <h2>
          Your next little
          <br />
          <em>moment of beauty.</em>
        </h2>
      </div>
      <div>
        <p>
          Reserve your next salon visit online.
          <br />
          The walk-in queue is coming in a future phase.
        </p>
        <div className="actions">
          <Link className="button light" to="/appointments">
            Book an appointment <ArrowUpRight size={17} />
          </Link>
          <Link className="text-link light-text" to="/queue">
            Walk-in queue <ArrowRight size={17} />
          </Link>
        </div>
      </div>
    </section>
  );
}
export function ServiceCard({ service }) {
  return (
    <article className="service-card">
      <Link to="/services" aria-label={`Explore ${service.name}`}>
        <div className="service-image">
          <img loading="lazy" src={service.image} alt={service.alt} />
          <span>{service.note}</span>
          <span className="round-arrow">
            <ArrowUpRight size={21} />
          </span>
        </div>
      </Link>
      <div className="service-title">
        <h3>{service.name}</h3>
        <span>{service.number}</span>
      </div>
      <p>{service.description}</p>
    </article>
  );
}
