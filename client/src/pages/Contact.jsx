import { Link } from "react-router-dom";
import { PageHeading } from "../components/Shared";
export default function Contact() {
  return (
    <>
      <PageHeading title="Contact & Location">Our address and contact details will be listed here once confirmed.</PageHeading>
      <section className="contact-grid container">
        <div className="contact-details">
          {[["Salon address", "Not yet confirmed"], ["Opening hours", "Not yet published"], ["Phone & email", "Not yet confirmed"]].map(([title, value]) => (
            <article key={title}><div><h3>{title}</h3><p>{value}</p></div></article>
          ))}
        </div>
        <aside className="contact-aside">
          <h2>Plan your visit</h2>
          <p>Book ahead or join the queue. Walk-ins can also check in with reception.</p>
          <Link className="button" to="/appointments">Book Appointment</Link>
          <Link className="text-link" to="/queue">Join Queue</Link>
        </aside>
      </section>
    </>
  );
}
