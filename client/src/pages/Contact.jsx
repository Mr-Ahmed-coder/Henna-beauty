import { MapPin, Clock, Mail, ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";
import { PageHeading } from "../components/Shared";
export default function Contact() {
  return (
    <>
      <PageHeading
        eyebrow="LET’S CONNECT"
        title={
          <>
            A warm welcome
            <br />
            <em>starts here.</em>
          </>
        }
      >
        We’re preparing the details for your visit. Official contact information
        will appear here once confirmed.
      </PageHeading>
      <section className="contact-grid container">
        <div className="contact-details">
          {[
            [
              MapPin,
              "Find the salon",
              "Address & map coming soon",
              "The official salon location is not yet available.",
            ],
            [
              Clock,
              "Opening hours",
              "To be confirmed",
              "Confirmed hours and holiday schedules will be added here.",
            ],
            [
              Mail,
              "Get in touch",
              "Contact details coming soon",
              "Phone, email, and social links are awaiting confirmation.",
            ],
          ].map(([Icon, title, value, note]) => (
            <article key={title}>
              <Icon strokeWidth={1.3} />
              <div>
                <p className="eyebrow">{title}</p>
                <h3>{value}</h3>
                <p>{note}</p>
              </div>
            </article>
          ))}
        </div>
        <aside className="contact-aside">
          <p className="eyebrow">PLAN A LITTLE YOU-TIME</p>
          <h2>
            Something lovely
            <br />
            is <em>on the way.</em>
          </h2>
          <p>
            Reserve an appointment online. The walk-in queue is planned for a
            future phase and is not accepting entries yet.
          </p>
          <Link className="button" to="/appointments">
            Book an appointment <ArrowUpRight size={17} />
          </Link>
          <Link className="text-link" to="/queue">
            About the walk-in queue <ArrowUpRight size={17} />
          </Link>
          <p className="fine-print">
            No contact form is active. Reservation details are collected only
            during appointment booking.
          </p>
        </aside>
      </section>
    </>
  );
}
